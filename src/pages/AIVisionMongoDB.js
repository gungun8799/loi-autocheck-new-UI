import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { FileText, UploadCloud, Globe, Table, ListChecks, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from './App.module.css';

function AIVisionMongoDB() {
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

  // ─── Authentication state ─────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);

  // ─── State hooks ─────────────────────────────────────────────────────────────
  const [files, setFiles] = useState([]);
  const [fileNames, setFileNames] = useState([]);
  const [extractedText, setExtractedText] = useState('');
  const [geminiText, setGeminiText] = useState('');
  const [pdfGemini, setPdfGemini] = useState('');
  const [loading, setLoading] = useState(false);
  const [promptKey, setPromptKey] = useState('');
  const [promptOptions, setPromptOptions] = useState([]);

  const [urlInput, setUrlInput] = useState('');
  const [scrapedText, setScrapedText] = useState('');
  const [scrapedGeminiText, setScrapedGeminiText] = useState('');
  const [webGemini, setWebGemini] = useState('');
  const [scrapeLoading, setScrapeLoading] = useState(false);

  const [excelFile, setExcelFile] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [excelResult, setExcelResult] = useState('');
  const [excelGemini, setExcelGemini] = useState('');
  const [tempExcelFileName, setTempExcelFileName] = useState('');

  const [compareSourceA, setCompareSourceA] = useState('');
  const [compareSourceB, setCompareSourceB] = useState('');
  const [compareSourceC, setCompareSourceC] = useState('');
  const [compareResult, setCompareResult] = useState('');

  const [validationResult, setValidationResult] = useState(null);
  const [webValidationResult, setWebValidationResult] = useState(null);
  const [meterValidationResult, setMeterValidationResult] = useState(null);

  const [documents, setDocuments] = useState([]);
  const [sessions, setSessions] = useState([]);

  // ─── Authentication check ─────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token || !userData) {
      navigate('/login', { replace: true });
      return;
    }

    try {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      setAuthToken(token);
    } catch (error) {
      console.error('Error parsing user data:', error);
      handleLogout();
    }
  }, [navigate]);

  // ─── Logout handler ─────────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setAuthToken(null);
    navigate('/login', { replace: true });
  };

  // ─── API helper with authentication ─────────────────────────────────────────
  const apiCall = async (method, url, data = null, isFormData = false) => {
    try {
      const config = {
        method,
        url: `${API_URL}${url}`,
        headers: {}
      };

      if (authToken) {
        config.headers['Authorization'] = `Bearer ${authToken}`;
      }

      if (isFormData) {
        config.data = data;
        // Don't set Content-Type for FormData, let browser set it
      } else if (data) {
        config.headers['Content-Type'] = 'application/json';
        config.data = data;
      }

      const response = await axios(config);
      return response;
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
      throw error;
    }
  };

  // ─── Fetch available prompt keys on mount ────────────────────────────────────
  useEffect(() => {
    const fetchPromptOptions = async () => {
      try {
        const res = await apiCall('GET', '/api/prompts');
        setPromptOptions(res.data.promptKeys);
        setPromptKey(res.data.promptKeys[0] || '');
      } catch (err) {
        console.error('Failed to fetch prompts:', err);
      }
    };
    
    if (authToken) {
      fetchPromptOptions();
    }
  }, [authToken]);

  // ─── Fetch user documents and sessions ────────────────────────────────────────
  useEffect(() => {
    const fetchUserData = async () => {
      if (!authToken) return;

      try {
        // Fetch documents
        const docsRes = await apiCall('GET', '/api/documents?limit=10');
        setDocuments(docsRes.data.documents || []);

        // Fetch sessions
        const sessionsRes = await apiCall('GET', '/api/sessions');
        setSessions(sessionsRes.data.sessions || []);
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [authToken]);

  // ─── Dropzone setup ──────────────────────────────────────────────────────────
  const onDrop = (acceptedFiles) => {
    setFiles(acceptedFiles);
    setFileNames(acceptedFiles.map((f) => f.name));
  };
  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
  });

  // ─── Document validation handler ─────────────────────────────────────────────
  const handleDocumentValidation = async () => {
    if (!pdfGemini) return;
    
    try {
      // Strip fences and isolate JSON
      let raw = pdfGemini.trim();
      if (raw.startsWith('```json')) raw = raw.slice(7);
      if (raw.endsWith('```')) raw = raw.slice(0, -3);
      const b1 = raw.indexOf('{'),
        b2 = raw.lastIndexOf('}');
      const jsonBlock = raw.substring(b1, b2 + 1);
      const parsed = JSON.parse(jsonBlock);

      // Call the API
      const res = await apiCall('POST', '/api/validate-document', {
        extractedData: parsed,
        promptKey,
      });

      // Clean response
      let v = res.data.validation.trim();
      if (v.startsWith('```json')) v = v.slice(7);
      if (v.endsWith('```')) v = v.slice(0, -3);
      setValidationResult(JSON.parse(v));
    } catch (err) {
      console.error('Document validation failed', err);
      setValidationResult([
        {
          field: 'Error',
          value: err.message,
          valid: false,
          reason: 'See console',
        },
      ]);
    }
  };

  // ─── Render a validation table ────────────────────────────────────────────────
  const renderValidationTable = (data) => {
    if (!Array.isArray(data)) {
      return <pre>{JSON.stringify(data, null, 2)}</pre>;
    }
    const cellStyle = {
      border: '1px solid #ccc',
      padding: '0.5rem',
      textAlign: 'left',
      fontSize: '0.95rem',
    };
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr>
            <th style={cellStyle}>Field</th>
            <th style={cellStyle}>Value</th>
            <th style={cellStyle}>Valid</th>
            <th style={cellStyle}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              <td style={cellStyle}>{row.field}</td>
              <td style={cellStyle}>{row.value ?? '—'}</td>
              <td style={cellStyle}>{row.valid ? '✅' : '❌'}</td>
              <td style={cellStyle}>{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ─── Handle file‐based extraction ────────────────────────────────────────────
  const extractFiles = async () => {
    if (!files.length) return;
    setLoading(true);
    
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('promptKey', promptKey);

      const res = await apiCall('POST', '/api/extract-text', formData, true);
      
      setExtractedText(res.data.text);
      setGeminiText(res.data.geminiOutput);
      setPdfGemini(res.data.geminiOutput);

      // Refresh documents list
      const docsRes = await apiCall('GET', '/api/documents?limit=10');
      setDocuments(docsRes.data.documents || []);
      
    } catch (err) {
      console.error('Error extracting files:', err);
      alert('Error extracting files: ' + (err.response?.data?.message || err.message));
    }
    setLoading(false);
  };

  // ─── Render user info and documents ───────────────────────────────────────────
  const renderUserDashboard = () => (
    <div className={styles.userDashboard}>
      <div className={styles.userInfo}>
        <User size={16} />
        <span>Welcome, {user?.username}</span>
        <span className={styles.userRole}>({user?.role})</span>
      </div>
      
      {documents.length > 0 && (
        <div className={styles.recentDocuments}>
          <h4>Recent Documents</h4>
          <div className={styles.documentsList}>
            {documents.slice(0, 5).map((doc) => (
              <div key={doc._id} className={styles.documentItem}>
                <span className={styles.docName}>{doc.originalName}</span>
                <span className={`${styles.docStatus} ${styles[doc.status]}`}>
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (!user || !authToken) {
    return <div>Loading...</div>;
  }

  return (
    <div className={styles.App}>
      {/* ─── Header with user info and logout ────────────────────────────────────── */}
      <div className={styles.headerBar}>
        {renderUserDashboard()}
        <button className={styles.logoutButton} onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div className={styles.container} style={{ flexDirection: 'column', alignItems: 'center' }}>
        {/* ─── Row 1: Prompt Selector ─────────────────────────────────────────────── */}
        <div className={styles.topBarRow}>
          <div className={styles.promptSelectorWrapper}>
            <label htmlFor="promptSelect">Select Prompt Template:</label>
            <select
              id="promptSelect"
              value={promptKey}
              onChange={(e) => setPromptKey(e.target.value)}
              className={styles.input}
            >
              <option value="">-- Choose Prompt --</option>
              {promptOptions.map((key, idx) => (
                <option key={idx} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Row 2: Upload Panels ───────────────────────────────────────────────── */}
        <div className={styles.uploadPanelsRow}>
          <div className={styles.panel}>
            <h2>
              <UploadCloud size={20} /> Upload PDF/Images
            </h2>
            <div {...getRootProps({ className: styles.dropzone })}>
              <input {...getInputProps()} />
              <p>Drag & drop or click to upload</p>
              <p className={styles.fileTypes}>PDF, JPG, PNG, Excel files supported</p>
            </div>
            {fileNames.length > 0 && (
              <ul className={styles.fileList}>
                {fileNames.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            )}
            <button onClick={extractFiles} className={styles.button} disabled={loading}>
              {loading ? 'Processing...' : 'Extract & Process'}
            </button>

            {extractedText && (
              <div className={styles.resultBlock}>
                <h3>OCR Text</h3>
                <pre className={styles.textOutput}>{extractedText}</pre>
                <h3>AI Analysis</h3>
                <pre className={styles.aiOutput}>{geminiText}</pre>
              </div>
            )}

            <button 
              onClick={handleDocumentValidation} 
              className={styles.button}
              disabled={!pdfGemini}
            >
              🧠 Validate Document
            </button>
            {validationResult && renderValidationTable(validationResult)}
          </div>

          {/* ─── Web Scraping Panel ────────────────────────────────────────────────── */}
          <div className={styles.panel}>
            <h2>
              <Globe size={20} /> Web Scraping
            </h2>
            <p className={styles.comingSoon}>
              Web scraping functionality will be integrated with the new backend.
            </p>
          </div>

          {/* ─── Excel/CSV Upload Panel ────────────────────────────────────────────── */}
          <div className={styles.panel}>
            <h2>
              <Table size={20} /> Excel/CSV Processing
            </h2>
            <p className={styles.comingSoon}>
              Excel processing functionality will be integrated with the new backend.
            </p>
          </div>
        </div>

        {/* ─── Row 3: Processing Statistics ─────────────────────────────────────────── */}
        {(documents.length > 0 || sessions.length > 0) && (
          <div className={styles.statsPanel}>
            <h3>Processing Statistics</h3>
            <div className={styles.statsGrid}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{documents.length}</span>
                <span className={styles.statLabel}>Total Documents</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{sessions.length}</span>
                <span className={styles.statLabel}>Processing Sessions</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>
                  {documents.filter(d => d.status === 'completed').length}
                </span>
                <span className={styles.statLabel}>Completed</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>
                  {documents.filter(d => d.status === 'failed').length}
                </span>
                <span className={styles.statLabel}>Failed</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AIVisionMongoDB;