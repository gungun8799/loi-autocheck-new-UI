import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PDFLinkDropdown.css';

const PDFLinkDropdown = ({ contractNumber }) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null);

  // Extract numeric contract number for API calls (PDFTracker expects only the numeric part)
  const extractContractNumber = (fullNumber) => {
    if (!fullNumber) return null;
    // Extract only the numeric part for PDFTracker compatibility
    const match = fullNumber.match(/^(\d+)_/);
    return match ? match[1] : fullNumber;
  };

  useEffect(() => {
    if (contractNumber) {
      fetchVersions();
    }
  }, [contractNumber]);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const contractNum = extractContractNumber(contractNumber);
      const response = await axios.get(
        `http://localhost:5001/api/pdf-versions/${contractNum}`
      );
      if (response.data.success) {
        setVersions(response.data.versions);
        // Auto-select the most recent version
        if (response.data.versions.length > 0) {
          setSelectedVersion(response.data.versions[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch PDF versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewPDF = (version) => {
    const pdfUrl = `http://localhost:5001/api/pdf/${version.relativePath}`;
    window.open(pdfUrl, '_blank');
    setShowDropdown(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusBadge = (status) => {
    const badges = {
      passed: '✅ Passed',
      failed: '❌ Failed',
      skipped: '⏭️ Skipped',
      pending: '⏳ Pending'
    };
    return badges[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      passed: '#4CAF50',
      failed: '#f44336',
      skipped: '#FF9800',
      pending: '#2196F3'
    };
    return colors[status] || '#9E9E9E';
  };

  if (loading) {
    return <span className="pdf-loading">Loading PDFs...</span>;
  }

  if (versions.length === 0) {
    return <span className="pdf-not-found">No PDF found</span>;
  }

  if (versions.length === 1) {
    // Single version - simple link
    const version = versions[0];
    return (
      <button
        className="pdf-single-link"
        onClick={() => handleViewPDF(version)}
        style={{ color: getStatusColor(version.status) }}
        title={`${version.filename} - ${formatDate(version.date)}`}
      >
        📄 View PDF
      </button>
    );
  }

  // Multiple versions - dropdown
  return (
    <div className="pdf-dropdown-container">
      <button
        className="pdf-dropdown-trigger"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        📄 PDF ({versions.length} versions) ▼
      </button>
      
      {showDropdown && (
        <div className="pdf-dropdown-menu">
          <div className="pdf-dropdown-header">
            Select PDF Version for Contract #{contractNumber}
          </div>
          {versions.map((version, index) => (
            <div
              key={index}
              className="pdf-dropdown-item"
              onClick={() => handleViewPDF(version)}
            >
              <div className="pdf-item-main">
                <span className="pdf-filename">{version.filename}</span>
                <span 
                  className="pdf-status"
                  style={{ color: getStatusColor(version.status) }}
                >
                  {getStatusBadge(version.status)}
                </span>
              </div>
              <div className="pdf-item-details">
                <span className="pdf-date">📅 {formatDate(version.date)}</span>
                <span className="pdf-size">📦 {formatFileSize(version.size)}</span>
                {version.processedDate && (
                  <span className="pdf-processed-date">
                    📁 {version.processedDate}
                  </span>
                )}
              </div>
              <div className="pdf-item-path">
                📂 {version.relativePath}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PDFLinkDropdown;