import React, { useEffect, useState } from 'react';
import axios from 'axios';
import styles from './LOIDashboard.module.css';
import { useNavigate } from 'react-router-dom';
import { BarChartBig, RefreshCcw } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import PDFLinkDropdown from '../components/PDFLinkDropdown';

import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Title,
} from 'chart.js';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Title);
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// a single axios instance, pointing straight at your backend:
const api = axios.create({
  baseURL: `${API_URL}/api`,
});


function LOIDashboard({ user }) {
  const navigate = useNavigate(); 
  const [contracts, setContracts] = useState([]);
  const [filteredContracts, setFilteredContracts] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [weekStats, setWeekStats] = useState({});
  
  // Tab state
  const [activeTab, setActiveTab] = useState('contract-list');
  const [rpaLogs, setRpaLogs] = useState([]);
  const [directoryData, setDirectoryData] = useState({ files: [], currentPath: '/processed' });
  
  // at the top of LOIDashboard(), right after your other useState calls:
const [editingWorkflowFor, setEditingWorkflowFor] = useState(null);
  const [refreshingContracts, setRefreshingContracts] = useState({});
   const [filters, setFilters] = useState({
       workflowStatus: '',
       tenantTypes:   [],    // ← multi
       leaseTypes:    [],    // ← multi
       status:        '',
       search:        '',
       leadStatus:    ''
     });

  // Manual validation editing states
  const [editingCompare, setEditingCompare] = useState(null);
  const [editingPdfValidation, setEditingPdfValidation] = useState(null);
  const [editingWebValidation, setEditingWebValidation] = useState(null);
     // at the top of LOIDashboard, after your other useState calls:

  const [leadStatuses, setLeadStatuses] = useState({});
  const handleLogout = () => {
   localStorage.removeItem('user');
   navigate('/login', { replace: true });
 };

 const [showExplorer, setShowExplorer] = useState(false);
const [contractsFolderFiles, setContractsFolderFiles] = useState([]);
const [processedFolderFiles, setProcessedFolderFiles] = useState([]);

  const [exportFrom, setExportFrom] = useState(''); // e.g. "2025-06-01"
const [exportTo, setExportTo] = useState('');     // e.g. "2025-06-10"
    // ─── New state hooks for “export from/to” ─────────────────────────────────
    const [exportFromRaw, setExportFromRaw] = useState('');
    const [exportToRaw, setExportToRaw] = useState('');

    // ─── New state for “Start Auto Processing” ───────────────────────────────────
    const [loadingAuto, setLoadingAuto] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);
    const [errorAuto, setErrorAuto] = useState(null);
    const [sharepointPath, setSharepointPath] = useState('');
  
  // ─── Multi-select states ─────────────────────────────────────────────────────
  const [selectedContracts, setSelectedContracts] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Failsafe states ─────────────────────────────────────────────────────────
  // Prevent double-start
  const [isProcessingAuto, setIsProcessingAuto] = useState(false);
  // Track online/offline
   const [isOnline, setIsOnline] = useState(navigator.onLine);
   
   useEffect(() => {
    if (!showExplorer) return;
    api.get('/list-files?folder=contracts').then(res => setContractsFolderFiles(res.data.files));
    api.get('/list-files?folder=processed').then(res => setProcessedFolderFiles(res.data.files));
  }, [showExplorer]);

   useEffect(() => {
    // Fetch contracts + lead statuses
    const fetchData = async () => {
      try {
        const res = await api.get('/get-compare-results');
        if (res.data.success && Array.isArray(res.data.data)) {
          const rawContracts = res.data.data;
          setContracts(rawContracts);
          setFilteredContracts(rawContracts);
          computeWeeklyStats(rawContracts);
        }
  
        const leadRes = await api.get('/get-lead-statuses');
        if (leadRes.data.success && leadRes.data.statuses) {
          setLeadStatuses(leadRes.data.statuses);
        }
  
        // If we got here, we’re online
        setIsOnline(true);
        setErrorAuto(null);
      } catch (err) {
        console.error('❌ Failed to fetch compare_result data:', err);
        // If the error is due to network, mark offline
        if (!navigator.onLine) {
          setIsOnline(false);
        }
      }
    };
  
    // Initial load
    fetchData();
  
    // Retry when back online
    const handleOnline = () => {
      setIsOnline(true);
      fetchData();
    };
  
    // Mark offline immediately on disconnect
    const handleOffline = () => setIsOnline(false);
  
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); 

  useEffect(() => {
    applyFilters();
  }, [filters, contracts]);

  const applyFilters = () => {
    let filteredData = contracts;
    if (filters.search) {
      filteredData = filteredData.filter(contract => 
        contract.contract_number?.toLowerCase().includes(filters.search.toLowerCase()) ||
        contract.workflow_status?.toLowerCase().includes(filters.search.toLowerCase()) ||
        contract.tenant_type?.toLowerCase().includes(filters.search.toLowerCase())
      );
    }
    if (filters.workflowStatus) {
      filteredData = filteredData.filter(contract => contract.workflow_status === filters.workflowStatus);
    }
    if (filters.tenantType) {
      filteredData = filteredData.filter(contract => contract.tenant_type === filters.tenantType);
    }
     // multi-tenant-type support
 if (filters.tenantTypes.length > 0) {
   filteredData = filteredData.filter(c =>
     filters.tenantTypes.includes(c.tenant_type)
   );
 }
 // same for leaseTypes
 if (filters.leaseTypes.length > 0) {
   filteredData = filteredData.filter(c =>
     filters.leaseTypes.includes(c.lease_type)
   );
 }
    if (filters.status) {
      filteredData = filteredData.filter(contract => isValid(contract) === (filters.status === 'Passed'));
    }
    if (filters.leadStatus) {
      filteredData = filteredData.filter(
        c => (leadStatuses[c.contract_number] || '') === filters.leadStatus
      );
    }
  
    setFilteredContracts(filteredData);
  };

  const toggleDetails = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const isValid = (item) => {
    // Filter validation_result using the same logic as frontend display
    const validationFiltered = Array.isArray(item.validation_result)
      ? item.validation_result.filter(row => {
          // Hide Net Rent (p.m.) field
          if (row.field === 'Net Rent (p.m.)') {
            return false;
          }
          // Hide specific fields from PDF validation table
          if (row.field === 'Monthly Service Rate' ||
              row.field === 'Rental Deposit' ||
              row.field === 'Service Deposit') {
            return false;
          }
          // Hide NULL year rows
          if ((row.field?.includes('Year 2') || row.field?.includes('Year 3')) && 
              (!row.value || row.value === 'NULL' || row.value === null || row.value === '')) {
            return false;
          }
          return true;
        })
      : [];

    // Filter compare_result using the same logic as frontend display
    const compareFiltered = Array.isArray(item.compare_result)
      ? item.compare_result.filter(row => {
          // Filter out Billing Frequency
          if (row.field === 'Billing Frequency') {
            return false;
          }
          // Hide service charge date fields from comparison table
          if (row.field === 'Other service charge (in the renting space) start date' ||
              row.field === 'Other service charge (in the renting space) end date' ||
              row.field === 'Other service charge (Common area) start date' ||
              row.field === 'Other service charge (Common area) end date') {
            return false;
          }
          // Hide NULL year rows
          if ((row.field?.includes('Year 2') || row.field?.includes('Year 3')) && 
              (!row.pdf || row.pdf === 'NULL' || row.pdf === null || row.pdf === '' ||
               !row.web || row.web === 'NULL' || row.web === null || row.web === '')) {
            return false;
          }
          return true;
        })
      : [];

    const validationValid = validationFiltered.length === 0 ? true : validationFiltered.every(row => row.valid === true);
    const compareValid = compareFiltered.length === 0 ? true : compareFiltered.every(row => row.match === true);
    
    return validationValid && compareValid;
  };

  // control the open/closed state of each dropdown
const [showLeaseDropdown,  setShowLeaseDropdown]  = useState(false);
const [showTenantDropdown, setShowTenantDropdown] = useState(false);

// toggle a single Lease Type on/off
const toggleLeaseType = (type) => {
  setFilters(prev => {
    const list = prev.leaseTypes.includes(type)
      ? prev.leaseTypes.filter(t => t !== type)
      : [...prev.leaseTypes, type];
    return { ...prev, leaseTypes: list };
  });
};

// toggle a single Tenant Type on/off
const toggleTenantType = (type) => {
  setFilters(prev => {
    const list = prev.tenantTypes.includes(type)
      ? prev.tenantTypes.filter(t => t !== type)
      : [...prev.tenantTypes, type];
    return { ...prev, tenantTypes: list };
  });
};

  const computeWeeklyStats = (contracts) => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());

    const countByDay = {
      Sunday: 0, Monday: 0, Tuesday: 0,
      Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0
    };

    contracts.forEach(c => {
      const date = c.timestamp?.toDate?.() || new Date(c.timestamp);
      if (date >= weekStart) {
        const day = date.toLocaleDateString('en-US', { weekday: 'long' });
        countByDay[day]++;
      }
    });

    setWeekStats(countByDay);
  };

  const passedCount = filteredContracts.filter(c => isValid(c)).length;
  const reviewCount = filteredContracts.length - passedCount;

  const handleExport = () => {
    // 1) Parse “from” / “to” into Date objects
    let fromDate = null,
        toDate   = null;
    if (exportFromRaw) {
      fromDate = new Date(exportFromRaw);
      fromDate.setHours(0,0,0,0);
    }
    if (exportToRaw) {
      toDate = new Date(exportToRaw);
      toDate.setHours(23,59,59,999);
    }
  
    // 2) Filter contracts by that range
    const inRange = filteredContracts.filter(contract => {
      const ts = contract.timestamp;
      let actualDate = null;
  
      // Firestore Timestamp?
      if (ts && typeof ts.toDate === 'function') {
        actualDate = ts.toDate();
      }
      // plain JSON _seconds?
      else if (ts && ts._seconds != null) {
        actualDate = new Date(ts._seconds * 1000 + (ts._nanoseconds||0)/1e6);
      }
      // seconds/nanoseconds variant?
      else if (ts && ts.seconds != null) {
        actualDate = new Date(ts.seconds * 1000 + (ts.nanoseconds||0)/1e6);
      }
      // fallback
      else {
        actualDate = new Date(ts);
      }
  
      if (!actualDate || isNaN(actualDate.getTime())) return false;
      if (fromDate && actualDate < fromDate) return false;
      if (toDate   && actualDate > toDate)   return false;
      return true;
    });
  
    // 3) Strip out big fields & format timestamp
    const cleaned = inRange.map(contract => {
      const {
        pdf_extracted,
        web_extracted,
        compare_result,
        validation_result,
        web_validation_result,
        meter_validation_result,
        gemini_output,
        popup_url,
        ...keep
      } = contract;
  
      return {
        ...keep,
        timestamp: formatDate(contract.timestamp),
      };
    });
  
    // 4) Generate & download the XLSX
    const ws = XLSX.utils.json_to_sheet(cleaned);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contracts');
    XLSX.writeFile(
      wb,
      `contracts_${exportFromRaw || 'start'}_${exportToRaw || 'end'}.xlsx`
    );
  };

  // 1. create exportBetween(fromRaw, toRaw) helper
const exportBetween = (fromRaw, toRaw) => {
  console.log('▶️ exportBetween fromRaw:', fromRaw);
  console.log('▶️ exportBetween toRaw:  ', toRaw);

  let fromDate = null, toDate = null;
  if (fromRaw) {
    fromDate = new Date(fromRaw);
    fromDate.setHours(0, 0, 0, 0);
  }
  if (toRaw) {
    toDate = new Date(toRaw);
    toDate.setHours(23, 59, 59, 999);
  }
  console.log('▶️ exportBetween parsed fromDate:', fromDate);
  console.log('▶️ exportBetween parsed toDate:  ', toDate);

  const inRange = filteredContracts.filter(contract => {
    const ts = contract.timestamp;
    console.log(`  • [${contract.contract_number}] raw timestamp:`, ts);

    let actualDate = null;
    if (ts && ts._seconds != null) {
      // Firestore‐style JSON
      actualDate = new Date(ts._seconds * 1000 + (ts._nanoseconds || 0) / 1e6);
    } else if (ts && ts.seconds != null) {
      // plain “seconds” variant
      actualDate = new Date(ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6);
    } else {
      actualDate = new Date(ts);
    }

    console.log('    → parsed actualDate:', actualDate);
    if (isNaN(actualDate.getTime())) {
      console.warn(`    ❌ [${contract.contract_number}] invalid Date → excluded`);
      return false;
    }
    if (fromDate && actualDate < fromDate) {
      console.warn(`    ❌ [${contract.contract_number}] before fromDate → excluded`);
      return false;
    }
    if (toDate && actualDate > toDate) {
      console.warn(`    ❌ [${contract.contract_number}] after toDate → excluded`);
      return false;
    }
    return true;
  });

  console.log('▶️ exportBetween in-range count:', inRange.length);

  const cleaned = inRange.map(contract => {
    const {
      pdf_extracted,
      web_extracted,
      compare_result,
      validation_result,
      web_validation_result,
      meter_validation_result,
      gemini_output,
      popup_url,
      ...keep
    } = contract;
    return {
      ...keep,
      timestamp: formatDate(contract.timestamp),
    };
  });

  const ws = XLSX.utils.json_to_sheet(cleaned);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contracts');
  XLSX.writeFile(wb, 'contracts.xlsx');
};
// new state for our dropdowns
const [tenantTypes, setTenantTypes] = useState([]);
const [leaseTypes, setLeaseTypes] = useState([]);

useEffect(() => {
  async function fetchData() {
    const res = await api.get('/get-compare-results');
    const raw = res.data.data || [];
    setContracts(raw);
    setFilteredContracts(raw);
    // compute unique lists
    setTenantTypes(Array.from(new Set(raw.map(c => c.tenant_type).filter(Boolean))));
    setLeaseTypes  (Array.from(new Set(raw.map(c => c.lease_type).filter(Boolean))));
    computeWeeklyStats(raw);
    // … the rest of your fetchData …
    // build unique lists for our filters
setTenantTypes(Array.from(
  new Set(raw.map(c => c.tenant_type).filter(Boolean))
));
setLeaseTypes(Array.from(
  new Set(raw.map(c => c.lease_type).filter(Boolean))
));
  }
  fetchData();
}, []);

  const handleLeadStatusChange = async (contractId, status) => {
    setLeadStatuses(prev => ({ ...prev, [contractId]: status }));
    try {
       await api.post('/update-lead-status', {
           contractNumber: contractId.replace(/_/g, '/'),
           leadStatus: status,
         });
      console.log(`[✅ Lead status for ${contractId} updated to ${status}`);
    } catch (error) {
      console.error(`[❌ Error updating lead status for ${contractId}]`, error);
    }
  };

  const forceProcessFile = async (contractNumber) => {
    try {
      const res = await api.post(`/force-process-contract`, {
        contractNumber
      });
  
      if (res.data.success) {
        alert('✅ Forced processing complete.');
  
        // Re-fetch the latest compare results and refresh state
        const { data } = await api.get('/get-compare-results');
        if (data.success && Array.isArray(data.data)) {
          setContracts(data.data);
          setFilteredContracts(data.data);
          computeWeeklyStats(data.data);
        }
      } else {
        alert('❌ Failed to start forced process.');
      }
    } catch (err) {
      alert('❌ Error during forced process.');
      console.error(err);
    }
  };

  

  const autoProcessContracts = async () => {
    // Start both loading and processing flags
    setIsProcessingAuto(true);
    setLoadingAuto(true);
    setErrorAuto(null);
    setSuccessMessage(null);
  
    try {
      // Trigger backend auto-process
      const res = await api.post(
        `/auto-process-pdf-folder`,
        { folderPath: sharepointPath }
      );
  
      if (res.data.success) {
        const count = res.data.processedCount || 0;
        const msg = `✅ Auto processing started: ${count} file(s) processed.`;
        setSuccessMessage(msg);
        alert(msg);
      } else {
        const errMsg = '⚠️ No new files found or nothing was processed.';
        setErrorAuto(errMsg);
        alert(errMsg);
      }
    } catch (err) {
      console.error('[Auto Processing Error]', err);
      let errMsg;
  
      if (!navigator.onLine) {
        errMsg = '❌ Network offline — will retry when you’re back online.';
      } else if (err.response?.status === 404) {
        errMsg = '❌ Endpoint not found: /api/auto-process-pdf-folder. Please check your backend route.';
      } else if (err.response?.status === 500) {
        errMsg = '❌ Server error occurred. Please try again later.';
      } else {
        errMsg = `❌ Unexpected error: ${err.message}`;
      }
  
      setErrorAuto(errMsg);
      alert(errMsg);
    } finally {
      // Clear flags
      setLoadingAuto(false);
      setIsProcessingAuto(false);
    }
  };

  // Inside LOIDashboard(), after handleExport:
// ─── “Today’s Report” handler ─────────────────────────────────────────────────
// 3. modify handleTodaysReport to compute “YYYY-MM-DD” and call exportBetween(...)
const handleTodaysReport = () => {
  // compute today’s date as “YYYY-MM-DD”
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1)
  .padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayString = `${yyyy}-${mm}-${dd}`;

  // directly call exportBetween with todayString
  exportBetween(todayString, todayString);
};

  const handleWorkflowStatusChange = async (contractNumber, chosenStatus) => {
    // If the user didn’t actually select anything (empty string), do nothing
    if (!chosenStatus) {
      return;
    }
  
    // 1. Confirm with the user before sending
    const confirmed = window.confirm(
      `Are you sure you want to change ${contractNumber} → "${chosenStatus}"?`
    );
    if (!confirmed) {
      return;
    }
  
    // 2. Send to backend
    try {
      await api.post('/update-workflow-status', {
        contractNumber,
        workflowStatus: chosenStatus
      });
  
      // 3. Update local state immediately so UI reflects it
      setContracts(prev =>
        prev.map(c =>
          c.contract_number === contractNumber
            ? { ...c, workflow_status: chosenStatus }
            : c
        )
      );
      setFilteredContracts(prev =>
        prev.map(c =>
          c.contract_number === contractNumber
            ? { ...c, workflow_status: chosenStatus }
            : c
        )
      );
  
      alert(`✅ Workflow status for ${contractNumber} changed to "${chosenStatus}".`);
    } catch (err) {
      console.error(`❌ Error updating workflow status for ${contractNumber}:`, err);
      alert('❌ Failed to update Workflow Status. See console for details.');
    }
  };

  // Manual validation handler functions
  const saveCompareEdit = async (contractNumber, fieldIndex) => {
    try {
      console.log('Saving compare edit:', { contractNumber, fieldIndex, editingCompare });
      const response = await api.post('/manual-validation/compare', {
        contractNumber,
        fieldIndex,
        updates: {
          match: editingCompare.match,
          reason: editingCompare.reason
        },
        user: user?.username || 'Unknown'
      });

      if (response.data.success) {
        // Update local state
        setContracts(prevContracts =>
          prevContracts.map(contract =>
            contract.contract_number === contractNumber
              ? {
                  ...contract,
                  compare_result: contract.compare_result.map((item, index) =>
                    index === fieldIndex
                      ? {
                          ...item,
                          match: editingCompare.match,
                          reason: editingCompare.reason,
                          manually_validated: true,
                          validated_by: user?.username || 'Unknown',
                          validated_at: new Date()
                        }
                      : item
                  )
                }
              : contract
          )
        );
        
        setEditingCompare(null);
        alert('✅ Compare result updated successfully');
      }
    } catch (error) {
      console.error('Error saving compare edit:', error);
      alert('❌ Failed to update compare result');
    }
  };

  const savePdfValidationEdit = async (contractNumber, fieldIndex) => {
    try {
      const response = await api.post('/manual-validation/pdf-validation', {
        contractNumber,
        fieldIndex,
        updates: {
          valid: editingPdfValidation.valid,
          reason: editingPdfValidation.reason
        },
        user: user?.username || 'Unknown'
      });

      if (response.data.success) {
        // Update local state
        setContracts(prevContracts =>
          prevContracts.map(contract =>
            contract.contract_number === contractNumber
              ? {
                  ...contract,
                  validation_result: contract.validation_result.map((item, index) =>
                    index === fieldIndex
                      ? {
                          ...item,
                          valid: editingPdfValidation.valid,
                          reason: editingPdfValidation.reason,
                          manually_validated: true,
                          validated_by: user?.username || 'Unknown',
                          validated_at: new Date()
                        }
                      : item
                  )
                }
              : contract
          )
        );
        
        setEditingPdfValidation(null);
        alert('✅ PDF validation updated successfully');
      }
    } catch (error) {
      console.error('Error saving PDF validation edit:', error);
      alert('❌ Failed to update PDF validation');
    }
  };

  const saveWebValidationEdit = async (contractNumber, fieldIndex) => {
    try {
      const response = await api.post('/manual-validation/web-validation', {
        contractNumber,
        fieldIndex,
        updates: {
          valid: editingWebValidation.valid,
          reason: editingWebValidation.reason
        },
        user: user?.username || 'Unknown'
      });

      if (response.data.success) {
        // Update local state
        setContracts(prevContracts =>
          prevContracts.map(contract =>
            contract.contract_number === contractNumber
              ? {
                  ...contract,
                  web_validation_result: contract.web_validation_result.map((item, index) =>
                    index === fieldIndex
                      ? {
                          ...item,
                          valid: editingWebValidation.valid,
                          reason: editingWebValidation.reason,
                          manually_validated: true,
                          validated_by: user?.username || 'Unknown',
                          validated_at: new Date()
                        }
                      : item
                  )
                }
              : contract
          )
        );
        
        setEditingWebValidation(null);
        alert('✅ Web validation updated successfully');
      }
    } catch (error) {
      console.error('Error saving web validation edit:', error);
      alert('❌ Failed to update web validation');
    }
  };

  // Helper to format Firestore timestamp (or plain JS Date) as "DD-MMM-YYYY"
// ─── Revised formatDate helper ──────────────────────────────────
// Converts Firestore Timestamp (or plain object with .seconds) or JS Date/string
// into "DD-MMM-YYYY". Returns '—' if invalid/absent.
// ─── Updated formatDate (handles ts.toDate(), ts.seconds, or ts._seconds) ──────────────────────────
const formatDate = (ts) => {
  if (!ts) return '—';

  let d;

  // A) Firestore Timestamp instance (has toDate()):
  if (typeof ts.toDate === 'function') {
    d = ts.toDate();

  // B) Plain object form from Firestore (could use .seconds or ._seconds):
  } else if (ts.seconds !== undefined) {
    d = new Date(ts.seconds * 1000);
  } else if (ts._seconds !== undefined) {
    d = new Date(ts._seconds * 1000);

  // C) Already a JS‐Date or an ISO‐string:
  } else {
    d = new Date(ts);
  }

  if (isNaN(d.getTime())) {
    return '—';
  }

  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const getContractDate = (ts) => {
  if (!ts) return null;
  // If it's a Firestore Timestamp object with toDate()
  if (typeof ts.toDate === 'function') {
    return ts.toDate();
  }
  // If it's stored as { seconds, nanoseconds }
  if (ts.seconds != null && ts.nanoseconds != null) {
    return new Date(ts.seconds * 1000 + ts.nanoseconds / 1e6);
  }
  // Fallback: try the Date constructor directly
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

// ───────────────────────────────────────────────────────────────────────────────────────────────

  const refreshContractStatus = async (contractNumber) => {
    // show spinner on that row
    setRefreshingContracts(prev => ({ ...prev, [contractNumber]: true }));
  
    try {
       const { data } = await api.post(
           '/refresh-contract-status',
           { contractNumber }
         );
  
      // if your API ever returns success: false, bubble it up
      if (!data.success) {
        throw new Error(data.message || 'Unknown error');
      }
  
      const newStatus = data.status; // e.g. "Accepted", "Pending"...
  
      // update the one contract in our state
      setContracts(old =>
        old.map(c =>
          c.contract_number === contractNumber
            ? { ...c, workflow_status: newStatus }
            : c
        )
      );
  
      alert(`🔄 Status updated to "${newStatus}"`);
    } catch (err) {
      console.error(
        '❌ refresh-contract-status failed:',
        err.response?.data ?? err.message
      );
      alert(
        `❌ Failed to refresh contract status:\n${
          err.response?.data?.message || err.message
        }`
      );
    } finally {
      // hide spinner
      setRefreshingContracts(prev => ({ ...prev, [contractNumber]: false }));
    }
  };

  // Multi-select checkbox handlers
  const handleSelectContract = (contractNumber) => {
    // Don't add null/undefined contract numbers
    if (!contractNumber) {
      console.warn('Attempted to select contract with null/undefined contract number');
      return;
    }
    
    setSelectedContracts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contractNumber)) {
        newSet.delete(contractNumber);
      } else {
        newSet.add(contractNumber);
      }
      return newSet;
    });
  };

  const handleSelectAll = (contractNumbers) => {
    // Filter out null/undefined contract numbers
    const validContractNumbers = contractNumbers.filter(cn => cn != null && cn !== '');
    
    setSelectedContracts(prev => {
      if (prev.size === validContractNumbers.length && validContractNumbers.every(cn => prev.has(cn))) {
        // If all are selected, deselect all
        return new Set();
      } else {
        // Select all valid contract numbers
        return new Set(validContractNumbers);
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedContracts.size === 0) {
      alert('Please select contracts to delete');
      return;
    }

    const confirmMsg = `Are you sure you want to delete ${selectedContracts.size} contract(s)? This action cannot be undone.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsDeleting(true);
    try {
      const contractsToDelete = Array.from(selectedContracts);
      const response = await api.post('/delete-contracts', { 
        contractNumbers: contractsToDelete 
      });

      if (response.data.success) {
        // Remove deleted contracts from state
        setContracts(prev => prev.filter(c => !selectedContracts.has(c.contract_number)));
        setFilteredContracts(prev => prev.filter(c => !selectedContracts.has(c.contract_number)));
        setSelectedContracts(new Set());
        alert(`Successfully deleted ${contractsToDelete.length} contract(s)`);
      } else {
        alert('Failed to delete contracts: ' + (response.data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting contracts:', error);
      alert('Error deleting contracts: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  
  return (
    <div className={styles.dashboardWrapper}>
      {/* Tab Navigation */}
      <div className={styles.tabNavigation}>
        <button 
          className={`${styles.tabButton} ${activeTab === 'contract-list' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('contract-list')}
        >
          Contract List
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'contract-navigation' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('contract-navigation')}
        >
          Contract Navigation
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'rpa-log' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('rpa-log')}
        >
          RPA Log
        </button>
      </div>

      {/* Logo, Title and Logout */}
      <div className={styles.logoContainer}>
        <div className={styles.logoTitleGroup}>
          <img 
            src="/CP_Axtra_Logo.png" 
            alt="CP Axtra Logo" 
            className={styles.logo}
          />
          <div className={styles.dashboardTitle}>
            LOI Auto Check Dashboard
          </div>
        </div>
        <button className={styles.logoutButton} onClick={handleLogout}>
          Logout
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'contract-list' && (
        <ContractListTab
          user={user}
          contracts={contracts}
          filteredContracts={filteredContracts}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          weekStats={weekStats}
          refreshingContracts={refreshingContracts}
          filters={filters}
          setFilters={setFilters}
          selectedContracts={selectedContracts}
          setSelectedContracts={setSelectedContracts}
          isDeleting={isDeleting}
          exportFromRaw={exportFromRaw}
          setExportFromRaw={setExportFromRaw}
          exportToRaw={exportToRaw}
          setExportToRaw={setExportToRaw}
          successMessage={successMessage}
          errorAuto={errorAuto}
          loadingAuto={loadingAuto}
          isProcessingAuto={isProcessingAuto}
          isOnline={isOnline}
          showExplorer={showExplorer}
          setShowExplorer={setShowExplorer}
          leadStatuses={leadStatuses}
          editingWorkflowFor={editingWorkflowFor}
          setEditingWorkflowFor={setEditingWorkflowFor}
          tenantTypes={tenantTypes}
          leaseTypes={leaseTypes}
          showLeaseDropdown={showLeaseDropdown}
          setShowLeaseDropdown={setShowLeaseDropdown}
          showTenantDropdown={showTenantDropdown}
          setShowTenantDropdown={setShowTenantDropdown}
          handleExport={handleExport}
          handleTodaysReport={handleTodaysReport}
          handleBulkDelete={handleBulkDelete}
          handleSelectContract={handleSelectContract}
          handleSelectAll={handleSelectAll}
          toggleDetails={toggleDetails}
          handleLeadStatusChange={handleLeadStatusChange}
          handleWorkflowStatusChange={handleWorkflowStatusChange}
          refreshContractStatus={refreshContractStatus}
          forceProcessFile={forceProcessFile}
          autoProcessContracts={autoProcessContracts}
          toggleLeaseType={toggleLeaseType}
          toggleTenantType={toggleTenantType}
          isValid={isValid}
          formatDate={formatDate}
          editingCompare={editingCompare}
          setEditingCompare={setEditingCompare}
          editingPdfValidation={editingPdfValidation}
          setEditingPdfValidation={setEditingPdfValidation}
          editingWebValidation={editingWebValidation}
          setEditingWebValidation={setEditingWebValidation}
          saveCompareEdit={saveCompareEdit}
          savePdfValidationEdit={savePdfValidationEdit}
          saveWebValidationEdit={saveWebValidationEdit}
        />
      )}

      {activeTab === 'contract-navigation' && (
        <ContractNavigationTab directoryData={directoryData} setDirectoryData={setDirectoryData} />
      )}

      {activeTab === 'rpa-log' && (
        <RPALogTab rpaLogs={rpaLogs} setRpaLogs={setRpaLogs} user={user} />
      )}

      {/* File Explorer Modal */}
      {showExplorer && (
        <FileExplorer onClose={() => setShowExplorer(false)} />
      )}
    </div>
  );
}

// FileExplorer Component
function FileExplorer({ onClose }) {
  const [tree, setTree] = useState([]);
  const [currentPath, setCurrentPath] = useState('');

  useEffect(() => {
    fetchTree('');
  }, []);


  
  const fetchTree = async (path) => {
    try {
      const res = await api.get('/list-directory', { params: { path } });
      let entries = res.data.entries;
      // At root, only show these two folders:
      if (path === '') {
        entries = entries.filter(e =>
          e.isDirectory && ['contracts', 'processed'].includes(e.name)
        );
      }
      setTree(entries);
      setCurrentPath(path);
    } catch (err) {
      console.error('Failed to list directory:', err);
    }
  };

  const enter = (entry) => {
    if (!entry.isDirectory) return;
    const next = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    fetchTree(next);
  };

  const downloadFile = (entry) => {
    const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    window.open(
      `${API_URL}/api/download-file?path=${encodeURIComponent(filePath)}`,
      '_blank'
    );
  };

  const downloadFolder = () => {
    window.open(
      `${API_URL}/api/download-folder?path=${encodeURIComponent(currentPath)}`,
      '_blank'
    );
  };

  // new: upload handler
  const uploadFiles = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    const form = new FormData();
    for (let file of files) {
      form.append('files', file);
    }
    try {
      await api.post('/upload-file', form, {
        params: { path: currentPath },
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchTree(currentPath); // refresh view
      e.target.value = ''; // reset input
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to upload files');
    }
  };

  // new: delete handler
  const deleteEntry = async (entry) => {
    const target = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    try {
      await api.delete('/delete-entry', { params: { path: target } });
      fetchTree(currentPath);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete entry');
    }
  };

  // Breadcrumb segments
  const crumbs = currentPath === ''
    ? []
    : currentPath.split('/').map((seg, i, arr) => ({
        name: seg,
        path: arr.slice(0, i + 1).join('/')
      }));

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.explorerHeader}>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
          <nav className={styles.breadcrumb}>
            <span
              className={styles.crumb}
              onClick={() => fetchTree('')}
            >
              Home
            </span>
            {crumbs.map(c => (
              <React.Fragment key={c.path}>
                <span className={styles.separator}>/</span>
                <span
                  className={styles.crumb}
                  onClick={() => fetchTree(c.path)}
                >
                  {c.name}
                </span>
              </React.Fragment>
            ))}
          </nav>
          <button
            className={styles.downloadFolderBtn}
            onClick={downloadFolder}
          >
            ↓ Download Folder
          </button>
          {/* new: upload button */}
          <label className={styles.uploadLabel}>
            ↑ Upload
            <input
              type="file"
              multiple
              onChange={uploadFiles}
              className={styles.uploadInput}
            />
          </label>
        </div>

        {/* File/Folder List */}
        <ul className={styles.fileList}>
          {tree.map(entry => (
            <li
              key={entry.name}
              className={entry.isDirectory ? styles.dirItem : styles.fileItem}
              onDoubleClick={() =>
                entry.isDirectory ? enter(entry) : downloadFile(entry)
              }
            >
              {entry.isDirectory ? '📁' : '📄'} {entry.name}
              <div className={styles.entryActions}>
                {!entry.isDirectory && (
                  <button
                    className={styles.downloadBtn}
                    onClick={e => { e.stopPropagation(); downloadFile(entry); }}
                  >
                    ↓
                  </button>
                )}
                <button
                  className={styles.deleteBtn}
                  onClick={e => { e.stopPropagation(); deleteEntry(entry); }}
                >
                  🗑️
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


// Contract List Tab Component
function ContractListTab({ 
  user, contracts, filteredContracts, expandedId, setExpandedId, weekStats, 
  refreshingContracts, filters, setFilters, selectedContracts, setSelectedContracts, 
  isDeleting, exportFromRaw, setExportFromRaw, exportToRaw, setExportToRaw, 
  successMessage, errorAuto, loadingAuto, isProcessingAuto, isOnline, 
  showExplorer, setShowExplorer, leadStatuses, editingWorkflowFor, setEditingWorkflowFor,
  tenantTypes, leaseTypes, showLeaseDropdown, setShowLeaseDropdown, 
  showTenantDropdown, setShowTenantDropdown, handleExport, handleTodaysReport, 
  handleBulkDelete, handleSelectContract, handleSelectAll, toggleDetails, 
  handleLeadStatusChange, handleWorkflowStatusChange, refreshContractStatus, 
  forceProcessFile, autoProcessContracts, toggleLeaseType, toggleTenantType, 
  isValid, formatDate, editingCompare, setEditingCompare, editingPdfValidation,
  setEditingPdfValidation, editingWebValidation, setEditingWebValidation,
  saveCompareEdit, savePdfValidationEdit, saveWebValidationEdit
}) {
  const passedCount = filteredContracts.filter(c => isValid(c)).length;
  const reviewCount = filteredContracts.length - passedCount;

  return (
    <div>
      {/* Auto Processing Button */}
      {(user?.role === 'super_user' || user?.role === 'admin') && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            className={styles.button_autoprocess}
            onClick={() => {
              if (isProcessingAuto) {
                return alert('⚠️ A process is already running. Please wait.');
              }
              if (!isOnline) {
                return alert('⚠️ You appear offline. Will resume when you\'re back online.');
              }
              autoProcessContracts();
            }}
            disabled={loadingAuto || !isOnline}
          >
            {loadingAuto ? '⏳ Processing…' : '⚙️ Start Auto Processing'}
          </button>
          {successMessage && (
            <span style={{ marginLeft: '1rem', color: 'green' }}>
              {successMessage}
            </span>
          )}
          {errorAuto && (
            <span style={{ marginLeft: '1rem', color: 'red' }}>
              {errorAuto}
            </span>
          )}
        </div>
      )}


      <div className={styles.kpiWrapper}>
        <div className={styles.kpiCard}>
          <h3>✅ Passed</h3>
          <div className={styles.kpiCardValue}>{filteredContracts.length > 0 ? passedCount : 0}</div>
        </div>
        <div className={styles.kpiCard}>
          <h3>❌ Needs Review</h3>
          <div className={styles.kpiCardValue}>{filteredContracts.length > 0 ? reviewCount : 0}</div>
        </div>
      </div>

      {/* Filters + Date‐range + Export button */}
      <div className={styles.filtersWrapper}>
        <input
          type="text"
          placeholder="Search by Contract Number, Status, or Tenant Type"
          value={filters.search}
          onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
        />
        {/* Status */}
        <select
          value={filters.status}
          onChange={e =>
            setFilters(prev => ({ ...prev, status: e.target.value }))
          }
        >
          <option value="">Select Status</option>
          <option value="Passed">Passed</option>
          <option value="Needs Review">Needs Review</option>
        </select>

        {/* Workflow Status */}
        <select
          value={filters.workflowStatus}
          onChange={e =>
            setFilters(prev => ({ ...prev, workflowStatus: e.target.value }))
          }
        >
          <option value="">Select Workflow Status</option>
          <option value="Accepted">Accepted</option>
          <option value="In Progress">In Progress</option>
          <option value="Pending">Pending</option>
        </select>

        {/* Lease Type (multi-select) */}
        <div className={styles.dropdownWrapper}>
          <button
            className={styles.dropdownToggle}
            onClick={() => setShowLeaseDropdown(open => !open)}
          >
            Lease Type
            {filters.leaseTypes.length > 0 && ` (${filters.leaseTypes.length})`}
          </button>

          {showLeaseDropdown && (
            <div
              className={
                `${styles.dropdownMenu} ` +
                `${styles.multiSelectContainer}`
              }
            >
              <button
                className={styles.clearButton}
                onClick={() =>
                  setFilters(prev => ({ ...prev, leaseTypes: [] }))
                }
              >
                Clear
              </button>

              {leaseTypes.map(type => (
                <label key={type}>
                  <input
                    type="checkbox"
                    checked={filters.leaseTypes.includes(type)}
                    onChange={() => toggleLeaseType(type)}
                  />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Tenant Type Dropdown */}
        <div className={styles.dropdownWrapper}>
          <button
            className={styles.dropdownToggle}
            onClick={() => setShowTenantDropdown(open => !open)}
          >
            Tenant Type
            {filters.tenantTypes.length > 0 && ` (${filters.tenantTypes.length})`}
          </button>

          {showTenantDropdown && (
            <div
              className={
                `${styles.dropdownMenu} ` +
                `${styles.multiSelectContainer}`
              }
            >
              <button
                className={styles.clearButton}
                onClick={() =>
                  setFilters(prev => ({ ...prev, tenantTypes: [] }))
                }
              >
                Clear
              </button>

              {tenantTypes.map(type => (
                <label key={type}>
                  <input
                    type="checkbox"
                    checked={filters.tenantTypes.includes(type)}
                    onChange={() => toggleTenantType(type)}
                  />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <select
          value={filters.leadStatus}
          onChange={e => setFilters(prev => ({ ...prev, leadStatus: e.target.value }))}
        >
          <option value="">Select Lead Status</option>
          <option value="Acknowledge">Acknowledge</option>
          <option value="In-progress">In-progress</option>
          <option value="Resolved">Resolved</option>
        </select>

        {/* "From" / "To" date pickers + Export buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label>
            From:&nbsp;
            <input
              type="date"
              value={exportFromRaw}
              onChange={e => setExportFromRaw(e.target.value)}
              style={{ height: '1.5rem' }}
            />
          </label>
          <label>
            To:&nbsp;
            <input
              type="date"
              value={exportToRaw}
              onChange={e => setExportToRaw(e.target.value)}
              style={{ height: '1.5rem' }}
            />
          </label>
          <button
            onClick={handleExport}
            style={{ height: '2rem', marginBottom: '1rem' }}
          >
            Export to Excel
          </button>
          <button
            onClick={handleTodaysReport}
            style={{ height: '2rem', marginBottom: '1rem' }}
          >
            Today's Report
          </button>

          <button
            onClick={() => setShowExplorer(true)}
            title="Open File Explorer"
            style={{
              height: '2rem',
              width: '2rem',
              padding: 0,
              fontSize: '2.2rem',
              lineHeight: 1,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '0.5rem',
            }}
          >
            📂
          </button>
        </div>
      </div>

      {/* Bulk Delete Button */}
      {selectedContracts.size > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={handleBulkDelete}
            disabled={isDeleting}
            style={{
              backgroundColor: '#dc3545',
              color: 'white',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.6 : 1
            }}
          >
            {isDeleting ? 'Deleting...' : `Delete ${selectedContracts.size} Contract(s)`}
          </button>
        </div>
      )}

      <table className={styles.resultTable}>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={filteredContracts.length > 0 && selectedContracts.size === filteredContracts.length}
                onChange={() => handleSelectAll(filteredContracts.map(c => c.contract_number))}
              />
            </th>
            <th>Contract</th>
            <th>PDF Files</th>
            <th>Timestamp</th>
            <th>Status</th>
            <th>OCR Confidence</th>
            <th>Workflow Status</th>
            <th>Lease Type</th>
            <th>Tenant Type</th>
            <th>Lead Status</th>
            <th>Summary</th>
            {user?.role !== 'user' && <th>Force Process</th>}
          </tr>
        </thead>
        <tbody>
        {(() => {
          const activeContracts = filteredContracts.filter(
            c => (leadStatuses[c.contract_number] || '').toLowerCase() !== 'resolved'
          );
          const resolvedContracts = filteredContracts.filter(
            c => (leadStatuses[c.contract_number] || '').toLowerCase() === 'resolved'
          );

          return (
            <>
              {/* Active rows */}
              {activeContracts.map((contract, idx) => {
                const status = isValid(contract) ? '✅ Passed' : '❌ Needs Review';
                const rowId = contract.contract_number || `row-${idx}`;
                return (
                  <React.Fragment key={rowId}>
                    <tr>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedContracts.has(contract.contract_number)}
                          onChange={() => handleSelectContract(contract.contract_number)}
                        />
                      </td>
                      <td>{contract.contract_number || '—'}</td>
                      <td>
                        {contract.contract_number ? (
                          <PDFLinkDropdown contractNumber={contract.contract_number} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatDate(contract.timestamp)}</td>
                      <td>{status}</td>
                      <td style={{ 
                        color: contract.ocr_confidence && contract.ocr_confidence < 0.8 ? '#ff6b6b' : 
                               contract.ocr_confidence && contract.ocr_confidence < 0.9 ? '#ffa500' : 
                               '#4CAF50',
                        fontWeight: contract.ocr_confidence && contract.ocr_confidence < 0.8 ? 'bold' : 'normal'
                      }}>
                        {contract.ocr_confidence ? `${(contract.ocr_confidence * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td>
                        {editingWorkflowFor === contract.contract_number ? (
                          <select
                            value={contract.workflow_status || ''}
                            onChange={e => {
                              handleWorkflowStatusChange(contract.contract_number, e.target.value);
                              setEditingWorkflowFor(null);
                            }}
                            onBlur={() => setEditingWorkflowFor(null)}
                            autoFocus
                            className={styles.workflowSelect}
                          >
                            <option value="">-- select status --</option>
                            <option value="Accepted">Accepted</option>
                            <option value="Reject">Reject</option>
                            <option value="Pending">Pending Verification</option>
                            <option value="Simplify need editing">Simplify need editing</option>
                            <option value="LOI need editing">LOI need editing</option>
                          </select>
                        ) : (
                          <>
                            {contract.workflow_status || '—'}
                            {refreshingContracts[contract.contract_number] ? (
                              <span className={styles.spinner} />
                            ) : (
                              <button
                                className={styles.refreshIconButton}
                                title="Refresh Status"
                                onClick={() => refreshContractStatus(contract.contract_number)}
                              >
                                <RefreshCcw size={14} />
                              </button>
                            )}
                            <button
                              className={styles.editWorkflowButton}
                              title="Edit Workflow Status"
                              onClick={() => setEditingWorkflowFor(contract.contract_number)}
                            >
                              ✏️
                            </button>
                          </>
                        )}
                      </td>
                      <td>{contract.lease_type || '—'}</td>
                      <td>{contract.tenant_type || '—'}</td>
                      <td>
                        <select
                          value={leadStatuses[contract.contract_number] || ''}
                          onChange={e => handleLeadStatusChange(contract.contract_number, e.target.value)}
                          className={styles.leadStatusSelect}
                        >
                          <option value="">Select Lead Status</option>
                          <option value="Acknowledge">Acknowledge</option>
                          <option value="In-progress">In-progress</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className={styles.expandButton}
                          onClick={() => toggleDetails(rowId)}
                        >
                          {expandedId === rowId ? 'Hide' : 'View Details'}
                        </button>
                      </td>
                      {user?.role !== 'user' && (
                        <td>
                          <button
                            className={styles.forceProcessButton}
                            onClick={() => {
                              if (isProcessingAuto) {
                                alert('⚠️ A process is already running. Please wait.');
                                return;
                              }
                              forceProcessFile(contract.contract_number);
                            }}
                            disabled={isProcessingAuto}
                          >
                            🚀 Force Process
                          </button>
                        </td>
                      )}
                    </tr>
                    {expandedId === rowId && (
                      <tr>
                        <td colSpan={user?.role !== 'user' ? 11 : 10}>
                          <div className={styles.detailsSection}>
                            <h4>🔍 Compare Result</h4>
                            <table className={styles.detailsTable}>
                              <thead>
                                <tr>
                                  <th>Field</th>
                                  <th>PDF</th>
                                  <th>Web</th>
                                  <th>Match</th>
                                  <th>Reason</th>
                                  {user?.role !== 'user' && <th>Actions</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {(contract.compare_result || [])
                                  .filter(row => {
                                    if (row.field === 'Billing Frequency') {
                                      return false;
                                    }
                                    if (contract.lease_type === 'Service Express' && row.field === 'Monthly charge') {
                                      return false;
                                    }
                                    if (
                                        row.field === 'Other service charge (Common area) start date' ||
                                        row.field === 'Other service charge (Common area) end date' ||
                                        row.field === 'Other service charge (public space) start date' ||
                                        row.field === 'Other service charge (public space) end date'|| 
                                        row.field === 'Other service charge before tax (public space)' ||
                                        row.field === 'Other service charge (public space) Charge description'|| 
                                        row.field === 'Other service charge before tax (public space)\t'|| 
                                        row.field === 'Other service charge (public space) Charge description\t'
                                  ) {
                                      return false;
                                    }
                                    if (contract.lease_type === 'Service Express' && row.field === 'Year 1 : Monthly Amount of service') {
                                      return false;
                                    }
                                    return true;
                                  })
                                  .map((row, i) => {
                                    // Find the actual index in the original array
                                    const actualIndex = contract.compare_result.findIndex(r => r.field === row.field);
                                    return (
                                  <tr key={i} style={row.manually_validated ? {backgroundColor: '#f0f8ff'} : {}}>
                                    <td>{row.field}</td>
                                    <td>{row.pdf}</td>
                                    <td>{row.web}</td>
                                    <td>
                                      {row.match ? '✅' : '❌'}
                                      {row.manually_validated && ' 👤'}
                                    </td>
                                    <td>
                                      {editingCompare?.contractId === contract.contract_number && editingCompare?.index === actualIndex ? (
                                        <input
                                          type="text"
                                          value={editingCompare.reason}
                                          onChange={(e) => setEditingCompare({...editingCompare, reason: e.target.value})}
                                          className={styles.editInput}
                                        />
                                      ) : (
                                        row.reason || '—'
                                      )}
                                    </td>
                                    {user?.role !== 'user' && (
                                      <td>
                                        {editingCompare?.contractId === contract.contract_number && editingCompare?.index === actualIndex ? (
                                          <div className={styles.editActions}>
                                            <button
                                              className={styles.saveBtn}
                                              onClick={() => saveCompareEdit(contract.contract_number, actualIndex)}
                                            >
                                              💾
                                            </button>
                                            <button
                                              className={styles.cancelBtn}
                                              onClick={() => setEditingCompare(null)}
                                            >
                                              ❌
                                            </button>
                                            <select
                                              value={editingCompare.match}
                                              onChange={(e) => setEditingCompare({...editingCompare, match: e.target.value === 'true'})}
                                              className={styles.matchSelect}
                                            >
                                              <option value="true">✅ Match</option>
                                              <option value="false">❌ No Match</option>
                                            </select>
                                          </div>
                                        ) : (
                                          <button
                                            className={styles.editBtn}
                                            onClick={() => setEditingCompare({
                                              contractId: contract.contract_number,
                                              index: actualIndex,
                                              match: row.match,
                                              reason: row.reason || ''
                                            })}
                                          >
                                            ✏️
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>

                            <h4>🧠 PDF Validation Result</h4>
                            <table className={styles.detailsTable}>
                              <thead>
                                <tr>
                                  <th>Field</th>
                                  <th>Value</th>
                                  <th>Valid</th>
                                  <th>Reason</th>
                                  {user?.role !== 'user' && <th>Actions</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {console.log('PDF Validation fields:', (contract.validation_result || []).map(r => r.field))}
                                {(contract.validation_result || [])
                                  .filter(row => {
                                    if (row.field === 'Net Rent (p.m.)') {
                                      return false;
                                    }
                                    if (row.field === 'Monthly Service Rate' ||
                                        row.field === 'Monthly Rental Rate' ||
                                        row.field === 'Rental Deposit' ||
                                        row.field === 'Service Deposit') {
                                      return false;
                                    }
                                    // Hide Total Rent Deposit and Total Deposits for Service Express (Tenancy Deposit is the validated field)
                                    if (contract.lease_type === 'Service Express' && (row.field === 'Total Rent Deposit' || row.field === 'Total Deposits')) {
                                      return false;
                                    }
                                    if ((row.field?.includes('Year 2') || row.field?.includes('Year 3')) && 
                                        (!row.value || row.value === 'NULL' || row.value === null || row.value === '')) {
                                      return false;
                                    }
                                    
                                    // Hide company fields for Service Express individual customers
                                    if (contract.lease_type === 'Service Express') {
                                      // Determine if customer is individual by checking if customer name contains company indicators
                                      const customerName = contract.pdf_extracted?.['Customer Name'] || contract.web_extracted?.['Customer Name'] || '';
                                      const isIndividual = !customerName.toLowerCase().includes('บริษัท') && 
                                                         !customerName.toLowerCase().includes('จำกัด') && 
                                                         !customerName.toLowerCase().includes('co.') && 
                                                         !customerName.toLowerCase().includes('ltd') &&
                                                         !customerName.toLowerCase().includes('inc.');
                                      
                                      if (isIndividual && (row.field === 'Company Registration Number' || 
                                                          row.field === 'Company Certificate issued date' ||
                                                          row.field === 'แนบหนังสือรับรองบริษัท' ||
                                                          row.field === 'มีตราประทับบนหนังสือรับรองบริษัทหรือไม่' ||
                                                          row.field === 'Names on Company Certificate' ||
                                                          row.field === 'Company Registered Address')) {
                                        return false;
                                      }
                                    }
                                    
                                    return true;
                                  })
                                  .sort((a, b) => {
                                    if (contract.lease_type === 'Service Express') {
                                      const fieldOrder = [
                                        'Lease Type',
                                        'Monthly charge',
                                        'Lease property tax rate', 
                                        'Year 1 : Contract Start date',
                                        'Year 1 : Contract End date',
                                        'Year 1 : Charge Type',
                                        'Year 1 : Monthly Amount of rent',
                                        'Year 1 : Monthly Amount of service',
                                        'Tenancy Deposit',
                                        'แนบหนังสือรับรองบริษัท',
                                        'มีตราประทับบนหนังสือรับรองบริษัทหรือไม่',
                                        'Citizen ID Number',
                                        'Citizen ID expiration date',
                                        'Name on Citizen ID card',
                                        'Address on Citizen ID card',
                                        'Company Registration Number',
                                        'Company Certificate issued date',
                                        'Names on Company Certificate',
                                        'Company Registered Address'
                                      ];
                                      
                                      const aIndex = fieldOrder.indexOf(a.field);
                                      const bIndex = fieldOrder.indexOf(b.field);
                                      
                                      if (aIndex !== -1 && bIndex !== -1) {
                                        return aIndex - bIndex;
                                      }
                                      if (aIndex !== -1) return -1;
                                      if (bIndex !== -1) return 1;
                                      return 0;
                                    }
                                    
                                    if (contract.lease_type === 'Permanent Fixed') {
                                      const fieldOrder = [
                                        'Lease Type',
                                        'Monthly charge',
                                        'Lease property tax rate',
                                        'Year 1 : Contract Start date',
                                        'Year 1 : Contract End date',
                                        'Year 1 : Charge Type',
                                        'Year 1 : Monthly Amount of rent',
                                        'Year 1 : Monthly Amount of service',
                                        'Tenancy Deposit'
                                      ];
                                      
                                      const aIndex = fieldOrder.indexOf(a.field);
                                      const bIndex = fieldOrder.indexOf(b.field);
                                      
                                      if (aIndex !== -1 && bIndex !== -1) {
                                        return aIndex - bIndex;
                                      }
                                      if (aIndex !== -1) return -1;
                                      if (bIndex !== -1) return 1;
                                      return 0;
                                    }
                                    
                                    return 0;
                                  })
                                  .map((row, i) => {
                                    // Find the actual index in the original array
                                    const actualIndex = contract.validation_result.findIndex(r => r.field === row.field);
                                    return (
                                  <tr key={i} style={row.manually_validated ? {backgroundColor: '#f0f8ff'} : {}}>
                                    <td>{row.field}</td>
                                    <td>{row.value}</td>
                                    <td>
                                      {row.valid ? '✅' : '❌'}
                                      {row.manually_validated && ' 👤'}
                                    </td>
                                    <td>
                                      {editingPdfValidation?.contractId === contract.contract_number && editingPdfValidation?.index === actualIndex ? (
                                        <input
                                          type="text"
                                          value={editingPdfValidation.reason}
                                          onChange={(e) => setEditingPdfValidation({...editingPdfValidation, reason: e.target.value})}
                                          className={styles.editInput}
                                        />
                                      ) : (
                                        row.reason || '—'
                                      )}
                                    </td>
                                    {user?.role !== 'user' && (
                                      <td>
                                        {editingPdfValidation?.contractId === contract.contract_number && editingPdfValidation?.index === actualIndex ? (
                                          <div className={styles.editActions}>
                                            <button
                                              className={styles.saveBtn}
                                              onClick={() => savePdfValidationEdit(contract.contract_number, actualIndex)}
                                            >
                                              💾
                                            </button>
                                            <button
                                              className={styles.cancelBtn}
                                              onClick={() => setEditingPdfValidation(null)}
                                            >
                                              ❌
                                            </button>
                                            <select
                                              value={editingPdfValidation.valid}
                                              onChange={(e) => setEditingPdfValidation({...editingPdfValidation, valid: e.target.value === 'true'})}
                                              className={styles.matchSelect}
                                            >
                                              <option value="true">✅ Valid</option>
                                              <option value="false">❌ Invalid</option>
                                            </select>
                                          </div>
                                        ) : (
                                          <button
                                            className={styles.editBtn}
                                            onClick={() => setEditingPdfValidation({
                                              contractId: contract.contract_number,
                                              index: actualIndex,
                                              valid: row.valid,
                                              reason: row.reason || ''
                                            })}
                                          >
                                            ✏️
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>

                            <h4>🌐 Simplicity Validation Result</h4>
                            <table className={styles.detailsTable}>
                              <thead>
                                <tr>
                                  <th>Field</th>
                                  <th>Value</th>
                                  <th>Valid</th>
                                  <th>Reason</th>
                                  {user?.role !== 'user' && <th>Actions</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {(contract.web_validation_result || [])
                                  .filter(row => {
                                    if (contract.lease_type === 'Service Express' && 
                                        (row.field === 'Year 1: Period start date' ||
                                         row.field === 'Year 1: Period end date' ||
                                         row.field === 'Year 1: Period end date' ||
                                         row.field === 'Space (NLA)')) {
                                      return false;
                                    }
                                    if (contract.lease_type === 'Permanent Fixed' && 
                                        (row.field === 'แบบสัญญากองทรัสต์' || row.field === 'แนบหนังสือรับรองบริษัท' || row.field === 'Unit Status' )) {
                                      return false;
                                    }
                                    if (row.field?.toLowerCase().includes('data completeness') || 
                                        row.field?.toLowerCase().includes('completeness')) {
                                      return false;
                                    }
                                    if ((row.field?.includes('Year 2') || row.field?.includes('Year 3')) && 
                                        (!row.value || row.value === 'NULL' || row.value === null || row.value === '')) {
                                      return false;
                                    }
                                    if (row.field === 'Other service charge (in the renting space) start date' ||
                                        row.field === 'Other service charge (in the renting space) end date' ||
                                        row.field === 'Other service charge (Common area) start date' ||
                                        row.field === 'Other service charge (Common area) end date') {
                                      return true;
                                    }
                                    return true;
                                  })
                                  .map((row, i) => {
                                    // Find the actual index in the original array
                                    const actualIndex = contract.web_validation_result.findIndex(r => r.field === row.field);
                                    return (
                                  <tr key={i} style={row.manually_validated ? {backgroundColor: '#f0f8ff'} : {}}>
                                    <td>{row.field}</td>
                                    <td>{row.value}</td>
                                    <td>
                                      {row.valid ? '✅' : '❌'}
                                      {row.manually_validated && ' 👤'}
                                    </td>
                                    <td>
                                      {editingWebValidation?.contractId === contract.contract_number && editingWebValidation?.index === actualIndex ? (
                                        <input
                                          type="text"
                                          value={editingWebValidation.reason}
                                          onChange={(e) => setEditingWebValidation({...editingWebValidation, reason: e.target.value})}
                                          className={styles.editInput}
                                        />
                                      ) : (
                                        row.reason || '—'
                                      )}
                                    </td>
                                    {user?.role !== 'user' && (
                                      <td>
                                        {editingWebValidation?.contractId === contract.contract_number && editingWebValidation?.index === actualIndex ? (
                                          <div className={styles.editActions}>
                                            <button
                                              className={styles.saveBtn}
                                              onClick={() => saveWebValidationEdit(contract.contract_number, actualIndex)}
                                            >
                                              💾
                                            </button>
                                            <button
                                              className={styles.cancelBtn}
                                              onClick={() => setEditingWebValidation(null)}
                                            >
                                              ❌
                                            </button>
                                            <select
                                              value={editingWebValidation.valid}
                                              onChange={(e) => setEditingWebValidation({...editingWebValidation, valid: e.target.value === 'true'})}
                                              className={styles.matchSelect}
                                            >
                                              <option value="true">✅ Valid</option>
                                              <option value="false">❌ Invalid</option>
                                            </select>
                                          </div>
                                        ) : (
                                          <button
                                            className={styles.editBtn}
                                            onClick={() => setEditingWebValidation({
                                              contractId: contract.contract_number,
                                              index: actualIndex,
                                              valid: row.valid,
                                              reason: row.reason || ''
                                            })}
                                          >
                                            ✏️
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>

                            {contract.meter_validation_result && contract.meter_validation_result.length > 0 && (
                              <div style={{ marginTop: '2rem' }}>
                                <h4>🌡 Meter Validation Result</h4>
                                <table className={styles.detailsTable}>
                                  <thead>
                                    <tr>
                                      <th>Field</th>
                                      <th>Value</th>
                                      <th>Valid</th>
                                      <th>Reason</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {contract.meter_validation_result
                                      .map((row, i) => (
                                      <tr key={i}>
                                        <td>{row.field}</td>
                                        <td>{row.value ?? '—'}</td>
                                        <td>{row.valid ? '✅' : '❌'}</td>
                                        <td>{row.reason || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Segment breaker */}
              {resolvedContracts.length > 0 && (
                <tr className={styles.segmentBreaker}>
                  <td colSpan={user?.role !== 'user' ? 11 : 10}>
                    📌 Resolved Contracts
                  </td>
                </tr>
              )}

              {/* Resolved rows (greyed out but fully interactive) */}
              {resolvedContracts.map((contract, idx) => {
                const status = isValid(contract) ? '✅ Passed' : '❌ Needs Review';
                const rowId = contract.contract_number || `resolved-${idx}`;
                return (
                  <React.Fragment key={rowId}>
                    <tr className={styles.resolvedRow}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedContracts.has(contract.contract_number)}
                          onChange={() => handleSelectContract(contract.contract_number)}
                        />
                      </td>
                      <td>{contract.contract_number || '—'}</td>
                      <td>
                        {contract.contract_number ? (
                          <PDFLinkDropdown contractNumber={contract.contract_number} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatDate(contract.timestamp)}</td>
                      <td>{status}</td>
                      <td style={{ 
                        color: contract.ocr_confidence && contract.ocr_confidence < 0.8 ? '#ff6b6b' : 
                               contract.ocr_confidence && contract.ocr_confidence < 0.9 ? '#ffa500' : 
                               '#4CAF50',
                        fontWeight: contract.ocr_confidence && contract.ocr_confidence < 0.8 ? 'bold' : 'normal'
                      }}>
                        {contract.ocr_confidence ? `${(contract.ocr_confidence * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td>
                        {editingWorkflowFor === contract.contract_number ? (
                          <select
                            value={contract.workflow_status || ''}
                            onChange={e => {
                              handleWorkflowStatusChange(contract.contract_number, e.target.value);
                              setEditingWorkflowFor(null);
                            }}
                            onBlur={() => setEditingWorkflowFor(null)}
                            autoFocus
                            className={styles.workflowSelect}
                          >
                            <option value="">-- select status --</option>
                            <option value="Accepted">Accepted</option>
                            <option value="Reject">Reject</option>
                            <option value="Pending">Pending Verification</option>
                            <option value="Simplify need editing">Simplify need editing</option>
                            <option value="LOI need editing">LOI need editing</option>
                          </select>
                        ) : (
                          <>
                            {contract.workflow_status || '—'}
                            {refreshingContracts[contract.contract_number] ? (
                              <span className={styles.spinner} />
                            ) : (
                              <button
                                className={styles.refreshIconButton}
                                title="Refresh Status"
                                onClick={() => refreshContractStatus(contract.contract_number)}
                              >
                                <RefreshCcw size={14} />
                              </button>
                            )}
                            <button
                              className={styles.editWorkflowButton}
                              title="Edit Workflow Status"
                              onClick={() => setEditingWorkflowFor(contract.contract_number)}
                            >
                              ✏️
                            </button>
                          </>
                        )}
                      </td>
                      <td>{contract.lease_type || '—'}</td>
                      <td>{contract.tenant_type || '—'}</td>
                      <td>
                        <select
                          value={leadStatuses[contract.contract_number] || ''}
                          onChange={e => handleLeadStatusChange(contract.contract_number, e.target.value)}
                          className={styles.leadStatusSelect}
                        >
                          <option value="">Select Lead Status</option>
                          <option value="Acknowledge">Acknowledge</option>
                          <option value="In-progress">In-progress</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className={styles.expandButton}
                          onClick={() => toggleDetails(rowId)}
                        >
                          {expandedId === rowId ? 'Hide' : 'View Details'}
                        </button>
                      </td>
                      {user?.role !== 'user' && (
                        <td>
                          <button
                            className={styles.forceProcessButton}
                            onClick={() => {
                              if (isProcessingAuto) {
                                alert('⚠️ A process is already running. Please wait.');
                                return;
                              }
                              forceProcessFile(contract.contract_number);
                            }}
                            disabled={isProcessingAuto}
                          >
                            🚀 Force Process
                          </button>
                        </td>
                      )}
                    </tr>
                    {expandedId === rowId && (
                      <tr className={styles.resolvedRow}>
                        <td colSpan={user?.role !== 'user' ? 11 : 10}>
                          <div className={styles.detailsSection}>
                            {/* …details content… */}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          );
        })()}
        </tbody>
      </table>
    </div>
  );
}

// Contract Navigation Tab Component
function ContractNavigationTab({ directoryData, setDirectoryData }) {
  const [currentPath, setCurrentPath] = useState('server/processed');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('date-desc'); // date-desc, date-asc, name-asc, name-desc
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchDirectory(currentPath);
  }, [currentPath]);

  const fetchDirectory = async (path) => {
    setLoading(true);
    try {
      console.log('Fetching directory:', path);
      const response = await api.get('/list-directories', { params: { path } });
      console.log('Directory response:', response.data);
      setFiles(response.data.entries || []);
    } catch (error) {
      console.error('Error fetching directory:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folderName) => {
    const newPath = currentPath === 'server/processed' ? `server/processed/${folderName}` : `${currentPath}/${folderName}`;
    setCurrentPath(newPath);
  };

  const navigateUp = () => {
    if (currentPath === 'server/processed') return;
    const pathParts = currentPath.split('/').filter(Boolean);
    pathParts.pop();
    const newPath = pathParts.join('/');
    setCurrentPath(newPath || 'server/processed');
  };

  const downloadFile = (fileName) => {
    const filePath = `${currentPath}/${fileName}`;
    window.open(
      `${API_URL}/api/download-file?path=${encodeURIComponent(filePath)}`,
      '_blank'
    );
  };

  const downloadFolder = (folderName = null) => {
    const pathToDownload = folderName ? `${currentPath}/${folderName}` : currentPath;
    window.open(
      `${API_URL}/api/download-folder?path=${encodeURIComponent(pathToDownload)}`,
      '_blank'
    );
  };

  const downloadSelectedFiles = () => {
    if (selectedFiles.size === 0) {
      alert('Please select files to download');
      return;
    }
    
    selectedFiles.forEach(fileName => {
      downloadFile(fileName);
    });
  };

  const downloadSelectedItems = async () => {
    if (selectedFiles.size === 0) {
      alert('Please select items to download');
      return;
    }
    
    const selectedArray = Array.from(selectedFiles);
    const totalItems = selectedArray.length;
    
    if (totalItems > 1) {
      const confirmMessage = `You are about to download ${totalItems} items. This may trigger multiple download prompts in your browser. Continue?`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
    }
    
    // Download items with a delay to prevent browser blocking
    for (let i = 0; i < selectedArray.length; i++) {
      const itemName = selectedArray[i];
      const item = files.find(f => f.name === itemName);
      
      if (item) {
        console.log(`📦 Starting download ${i + 1}/${totalItems}: ${itemName} (${item.isDirectory ? 'folder' : 'file'})`);
        
        try {
          if (item.isDirectory) {
            const pathToDownload = `${currentPath}/${itemName}`;
            console.log(`📁 Downloading folder with path: ${pathToDownload}`);
            downloadFolder(itemName);
          } else {
            const filePath = `${currentPath}/${itemName}`;
            console.log(`📄 Downloading file with path: ${filePath}`);
            downloadFile(itemName);
          }
          
          console.log(`✅ Download initiated for: ${itemName}`);
          
          // Add delay between downloads (except for the last one)
          if (i < selectedArray.length - 1) {
            console.log(`⏳ Waiting 2 seconds before next download...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
          }
        } catch (error) {
          console.error(`❌ Error downloading ${itemName}:`, error);
        }
      } else {
        console.warn(`⚠️ Item not found in files array: ${itemName}`);
      }
    }
    
    console.log(`✅ Initiated download for ${totalItems} item(s)`);
    console.log(`📌 Note: Each folder will download as a separate ZIP file with timestamp to avoid conflicts`);
  };

  const downloadSelectedItemsCombined = async () => {
    if (selectedFiles.size === 0) {
      alert('Please select items to download');
      return;
    }
    
    const selectedArray = Array.from(selectedFiles);
    const totalItems = selectedArray.length;
    
    const confirmMessage = `Create one combined ZIP file containing all ${totalItems} selected item(s)?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      console.log(`📦 Creating combined ZIP for ${totalItems} items:`, selectedArray);
      console.log(`📁 Base path: ${currentPath}`);
      
      const response = await api.post('/download-bulk', {
        items: selectedArray,
        basePath: currentPath
      }, {
        responseType: 'blob' // Important for file download
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from response headers or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `bulk_download_${new Date().getTime()}.zip`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      
      console.log(`✅ Combined ZIP download initiated: ${filename}`);
      
    } catch (error) {
      console.error('❌ Error creating combined download:', error);
      alert('Failed to create combined download. Please try again.');
    }
  };

  const deleteSelectedItems = async () => {
    if (selectedFiles.size === 0) {
      alert('Please select items to delete');
      return;
    }

    const confirmMessage = `Are you sure you want to delete ${selectedFiles.size} selected item(s)? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const itemsToDelete = Array.from(selectedFiles);
      const deletePromises = itemsToDelete.map(async (itemName) => {
        const item = files.find(f => f.name === itemName);
        if (item && item.isDirectory) {
          // For directories, show a warning that folder deletion is not supported
          alert(`Cannot delete folder "${itemName}". Folder deletion is not currently supported for safety reasons.`);
          return { itemName, success: false };
        }
        
        const itemPath = `${currentPath}/${itemName}`;
        const response = await api.delete('/delete-entry', { 
          params: { path: itemPath } 
        });
        return { itemName, success: response.status === 200 };
      });

      const results = await Promise.allSettled(deletePromises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;

      if (successful > 0) {
        alert(`Successfully deleted ${successful} item(s)${failed > 0 ? `, ${failed} failed` : ''}`);
        setSelectedFiles(new Set());
        fetchDirectory(currentPath); // Refresh the directory
      } else {
        alert('Failed to delete selected items');
      }
    } catch (error) {
      console.error('Error deleting items:', error);
      alert('Error deleting items: ' + error.message);
    }
  };

  const toggleFileSelection = (fileName) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileName)) {
        newSet.delete(fileName);
      } else {
        newSet.add(fileName);
      }
      return newSet;
    });
  };

  const selectAllItems = () => {
    const allNames = files.map(f => f.name);
    if (selectedFiles.size === allNames.length) {
      // If all are selected, deselect all
      setSelectedFiles(new Set());
    } else {
      // Select all items (both files and folders)
      setSelectedFiles(new Set(allNames));
    }
  };

  const clearSelection = () => {
    setSelectedFiles(new Set());
  };

  // Enhanced filtering and sorting function
  const getFilteredAndSortedFiles = () => {
    let filtered = files;
    
    // Apply search filter
    const searchTerm = searchQuery.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(file => 
        file.name.toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply legacy filter (keep for backward compatibility)
    if (filter) {
      filtered = filtered.filter(file => 
        file.name.toLowerCase().includes(filter.toLowerCase())
      );
    }
    
    // Sort files
    const sorted = [...filtered].sort((a, b) => {
      // Always put directories first, then files
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      
      // Both are directories or both are files, apply sorting
      switch (sortBy) {
        case 'date-desc':
          return sortByDateDescending(a.name, b.name);
        case 'date-asc':
          return sortByDateAscending(a.name, b.name);
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        default:
          return sortByDateDescending(a.name, b.name);
      }
    });
    
    return sorted;
  };

  // Helper function to sort by date (for date folders like 2025-08-19)
  const sortByDateDescending = (nameA, nameB) => {
    const dateA = extractDateFromName(nameA);
    const dateB = extractDateFromName(nameB);
    
    // If both are valid dates, sort by date
    if (dateA && dateB) {
      return dateB - dateA; // Descending (newest first)
    }
    
    // If only one is a date, date comes first
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    
    // Neither are dates, sort alphabetically
    return nameA.localeCompare(nameB);
  };

  const sortByDateAscending = (nameA, nameB) => {
    const dateA = extractDateFromName(nameA);
    const dateB = extractDateFromName(nameB);
    
    // If both are valid dates, sort by date
    if (dateA && dateB) {
      return dateA - dateB; // Ascending (oldest first)
    }
    
    // If only one is a date, date comes first
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    
    // Neither are dates, sort alphabetically
    return nameA.localeCompare(nameB);
  };

  // Helper function to extract date from folder name
  const extractDateFromName = (name) => {
    // Match date patterns like 2025-08-19, 2025-05-10, etc.
    const dateMatch = name.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return null;
  };

  const filteredFiles = getFilteredAndSortedFiles();

  const breadcrumbParts = currentPath.split('/').filter(Boolean);

  return (
    <div className={styles.contractNavigation}>
      <div className={styles.navigationHeader}>
        <h2>📁 Contract File Explorer</h2>
        
        {/* Breadcrumb Navigation */}
        <div className={styles.breadcrumb}>
          <span 
            className={styles.breadcrumbItem}
            onClick={() => setCurrentPath('server/processed')}
          >
            server/processed
          </span>
          {breadcrumbParts.slice(2).map((part, index) => {
            const partialPath = breadcrumbParts.slice(0, index + 3).join('/');
            return (
              <React.Fragment key={index}>
                <span className={styles.breadcrumbSeparator}>/</span>
                <span 
                  className={styles.breadcrumbItem}
                  onClick={() => setCurrentPath(partialPath)}
                >
                  {part}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        {/* Navigation Controls */}
        <div className={styles.navigationControls}>
          <div className={styles.navigationActions}>
            <button 
              onClick={navigateUp} 
              disabled={currentPath === 'server/processed'}
              className={`${styles.backButton} ${currentPath === 'server/processed' ? styles.disabled : ''}`}
            >
              ← Back
            </button>
            
            <input
              type="text"
              placeholder="🔍 Search files and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.filterInput}
            />
            
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={styles.sortSelect}
            >
              <option value="date-desc">📅 Date (Newest First)</option>
              <option value="date-asc">📅 Date (Oldest First)</option>
              <option value="name-asc">🔤 Name (A-Z)</option>
              <option value="name-desc">🔤 Name (Z-A)</option>
            </select>
            
            {(searchQuery || filter) && (
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setFilter('');
                }}
                className={styles.clearButton}
                title="Clear search"
              >
                ✕ Clear
              </button>
            )}
          </div>
          
          <div className={styles.bulkActions}>
            <button onClick={() => downloadFolder()} className={styles.actionButton}>
              📁 Download Current Folder
            </button>
            
            <button 
              onClick={selectAllItems} 
              className={styles.actionButton}
            >
              {selectedFiles.size === files.length && files.length > 0 
                ? '❌ Deselect All' 
                : '✅ Select All Items'
              }
            </button>
            
            {selectedFiles.size > 0 && (
              <>
                <button onClick={downloadSelectedItemsCombined} className={styles.actionButton}>
                  📦 Download Selected ({selectedFiles.size})
                </button>
                <button onClick={deleteSelectedItems} className={styles.deleteButton}>
                  🗑️ Delete Selected ({selectedFiles.size})
                </button>
                <button onClick={clearSelection} className={styles.clearButton}>
                  Clear Selection
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <div className={styles.fileList}>
          {/* Header row with select all */}
          {filteredFiles.length > 0 && (
            <div className={styles.fileListHeader}>
              <div className={styles.headerInfo}>
                <input
                  type="checkbox"
                  checked={selectedFiles.size === filteredFiles.length && filteredFiles.length > 0}
                  onChange={selectAllItems}
                  className={styles.selectAllCheckbox}
                />
                <span className={styles.headerText}>
                  {filteredFiles.length} item(s)
                  {(searchQuery || filter) && files.length !== filteredFiles.length && 
                    ` (filtered from ${files.length})`
                  }
                  {selectedFiles.size > 0 && ` | ${selectedFiles.size} selected`}
                  {sortBy !== 'date-desc' && (
                    <span className={styles.sortInfo}> • Sorted by {sortBy.replace('-', ' ')}</span>
                  )}
                </span>
              </div>
              <div className={styles.headerActions}>
                <span className={styles.headerLabel}>Actions</span>
              </div>
            </div>
          )}
          
          {/* Directories first, then files */}
          {filteredFiles
            .sort((a, b) => {
              // Directories first
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              // Then sort alphabetically within each group
              return a.name.localeCompare(b.name);
            })
            .map((file, index) => (
            <div 
              key={index} 
              className={`${styles.fileListItem} ${
                file.isDirectory ? styles.directoryItem : styles.fileItem
              } ${
                selectedFiles.has(file.name) ? styles.selected : ''
              }`}
            >
              <div 
                className={styles.fileInfo}
                onClick={() => {
                  if (file.isDirectory) {
                    navigateToFolder(file.name);
                  }
                }}
              >
                <div className={styles.fileIcon}>
                  {file.isDirectory ? '📁' : '📄'}
                </div>
                <div className={styles.fileDetails}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileType}>
                    {file.isDirectory ? 'Folder' : 'File'}
                  </span>
                </div>
              </div>
              
              <div className={styles.fileActions}>
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.name)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleFileSelection(file.name);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={styles.fileCheckbox}
                />
                
                {file.isDirectory ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFolder(file.name);
                      }}
                      className={styles.downloadButton}
                      title="Download folder"
                    >
                      📁⬇️
                    </button>
                    <button
                      className={styles.openButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToFolder(file.name);
                      }}
                    >
                      Open →
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadFile(file.name);
                    }}
                    className={styles.downloadButton}
                    title="Download file"
                  >
                    📄⬇️
                  </button>
                )}
              </div>
            </div>
          ))}
          
          {filteredFiles.length === 0 && (
            <div className={styles.emptyFolder}>
              📂 This folder is empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// RPA Log Tab Component
function RPALogTab({ rpaLogs, setRpaLogs, user }) {
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    fetchRPALogs();
  }, []);

  const fetchRPALogs = async () => {
    setLoading(true);
    try {
      const response = await api.get('/get-rpa-logs');
      setRpaLogs(response.data.logs || []);
    } catch (error) {
      console.error('Error fetching RPA logs:', error);
      setRpaLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const filteredLogs = rpaLogs.filter(log => {
    const matchesText = !filter || 
      log.action?.toLowerCase().includes(filter.toLowerCase()) ||
      log.user?.toLowerCase().includes(filter.toLowerCase()) ||
      log.contractNumber?.toLowerCase().includes(filter.toLowerCase());
    
    const matchesDate = !dateFilter || 
      (log.timestamp && new Date(log.timestamp).toDateString() === new Date(dateFilter).toDateString());
    
    return matchesText && matchesDate;
  });

  return (
    <div className={styles.rpaLogTab}>
      <div className={styles.rpaLogHeader}>
        <h2>🤖 RPA Activity Log</h2>
        
        <div className={styles.logControls}>
          <input
            type="text"
            placeholder="Filter by action, user, or contract..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={styles.filterInput}
          />
          
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className={styles.dateFilter}
          />
          
          <button onClick={fetchRPALogs} className={styles.refreshButton}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading logs...</div>
      ) : (
        <div className={styles.logContainer}>
          <table className={styles.logTable}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>User</th>
                <th>Contract</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log, index) => (
                <tr key={index} className={styles.logRow}>
                  <td>{formatDate(log.timestamp)}</td>
                  <td>
                    <span className={`${styles.actionBadge} ${styles[log.actionType] || ''}`}>
                      {log.action}
                    </span>
                  </td>
                  <td>{log.user || '—'}</td>
                  <td>{log.contractNumber || '—'}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[log.status?.toLowerCase()] || ''}`}>
                      {log.status || '—'}
                    </span>
                  </td>
                  <td className={styles.details}>
                    {log.details && (
                      <details>
                        <summary>View Details</summary>
                        <pre>{JSON.stringify(log.details, null, 2)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredLogs.length === 0 && (
            <div className={styles.noLogs}>
              No logs found matching the current filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LOIDashboard;