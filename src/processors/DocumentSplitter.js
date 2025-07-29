/**
 * Document splitting logic to separate patient reports
 */
export class DocumentSplitter {
  constructor(config) {
    this.maxPagesPerPatient = config.processing.maxPagesPerPatient;
    this.patientIndicatorKeys = [
      'patient name', 'name', 'patient', 'patient id', 'mrn', 'medical record number'
    ];
  }

  splitIntoPatientReports(pageDataArray) {
    if (!pageDataArray || pageDataArray.length === 0) {
      throw new Error("No page data provided for splitting");
    }

    const reports = [];
    let current = [];
    let currentPatientInfo = null;

    for (const [index, pageData] of pageDataArray.entries()) {
      const pagePatientInfo = this._extractPatientInfo(pageData);
      const isDifferentPatient = this._isDifferentPatient(currentPatientInfo, pagePatientInfo);

      // Start new report if we find a different patient and current report has pages
      if (isDifferentPatient && current.length > 0) {
        console.log(`📄 New patient detected at page ${index + 1}, splitting report`);
        reports.push(this._finalizeReport(current, reports.length));
        current = [];
        currentPatientInfo = pagePatientInfo;
      } else if (!currentPatientInfo && pagePatientInfo) {
        // First patient found
        currentPatientInfo = pagePatientInfo;
        console.log(`📄 First patient found at page ${index + 1}: ${pagePatientInfo.name || 'Unknown'}`);
      }

      current.push(pageData);

      // Safety check to prevent runaway reports
      if (current.length >= this.maxPagesPerPatient) {
        console.warn(`Report exceeded max pages (${this.maxPagesPerPatient}), forcing split at page ${index + 1}`);
        reports.push(this._finalizeReport(current, reports.length));
        current = [];
        currentPatientInfo = null; // Reset for next report
      }
    }

    // Add the last report if it has pages
    if (current.length > 0) {
      reports.push(this._finalizeReport(current, reports.length));
    }

    return this._validateReports(reports);
  }

  // Set custom patient indicator keys
  setPatientIndicatorKeys(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error("Patient indicator keys must be a non-empty array");
    }
    this.patientIndicatorKeys = keys.map(key => key.toLowerCase());
  }

  // Get current patient indicator keys
  getPatientIndicatorKeys() {
    return [...this.patientIndicatorKeys];
  }

  _extractPatientInfo(pageData) {
    if (!pageData) return null;

    const { keyValuePairs, tables } = pageData;
    const patientInfo = {
      name: null,
      patientId: null,
      dob: null
    };

    // Extract from key-value pairs first (most reliable)
    if (keyValuePairs) {
      // Try to find patient name
      const nameKeys = ['patient name', 'name', 'patient', 'full name'];
      for (const key of nameKeys) {
        if (keyValuePairs[key]) {
          patientInfo.name = this._cleanPatientValue(keyValuePairs[key]);
          break;
        }
      }

      // Try to find patient ID
      const idKeys = ['patient id', 'id', 'mrn', 'medical record number', 'patient #', 'account'];
      for (const key of idKeys) {
        if (keyValuePairs[key]) {
          patientInfo.patientId = this._cleanPatientValue(keyValuePairs[key]);
          break;
        }
      }

      // Try to find DOB
      const dobKeys = ['dob', 'date of birth', 'birth date', 'birthdate'];
      for (const key of dobKeys) {
        if (keyValuePairs[key]) {
          patientInfo.dob = this._cleanPatientValue(keyValuePairs[key]);
          break;
        }
      }
    }

    // Fallback to table data if key-value pairs didn't yield results
    if ((!patientInfo.name || !patientInfo.patientId) && tables && tables.length > 0) {
      this._extractFromTables(tables, patientInfo);
    }

    // Return null if no meaningful patient info found
    if (!patientInfo.name && !patientInfo.patientId) {
      return null;
    }

    return patientInfo;
  }

  _isDifferentPatient(currentPatient, newPatient) {
    // If no current patient, any new patient info indicates a new patient
    if (!currentPatient) {
      return !!newPatient;
    }

    // If no new patient info found, assume same patient continues
    if (!newPatient) {
      return false;
    }

    // Compare patient identifiers
    // Patient ID is the most reliable identifier
    if (currentPatient.patientId && newPatient.patientId) {
      return currentPatient.patientId !== newPatient.patientId;
    }

    // If no patient IDs, compare names
    if (currentPatient.name && newPatient.name) {
      return currentPatient.name !== newPatient.name;
    }

    // If we have DOB for both, compare that too
    if (currentPatient.dob && newPatient.dob) {
      return currentPatient.dob !== newPatient.dob;
    }

    // If we can't reliably compare, assume same patient to avoid over-splitting
    return false;
  }

  _extractFromTables(tables, patientInfo) {
    const nameKeys = ['patient name', 'name', 'patient'];
    const idKeys = ['patient id', 'id', 'mrn', 'medical record'];
    const dobKeys = ['dob', 'date of birth', 'birth date'];

    tables.forEach(table => {
      if (!table.rows) return;

      table.rows.forEach(row => {
        if (!Array.isArray(row)) return;

        row.forEach((cell, index) => {
          if (!cell || typeof cell !== 'string') return;

          const cellLower = cell.toLowerCase();

          // Check for patient name
          if (!patientInfo.name && nameKeys.some(key => cellLower.includes(key))) {
            const valueCell = row[index + 1] || cell.split(':')[1];
            if (valueCell && valueCell.trim() !== cellLower) {
              patientInfo.name = this._cleanPatientValue(valueCell);
            }
          }

          // Check for patient ID
          if (!patientInfo.patientId && idKeys.some(key => cellLower.includes(key))) {
            const valueCell = row[index + 1] || cell.split(':')[1];
            if (valueCell && valueCell.trim() !== cellLower) {
              patientInfo.patientId = this._cleanPatientValue(valueCell);
            }
          }

          // Check for DOB
          if (!patientInfo.dob && dobKeys.some(key => cellLower.includes(key))) {
            const valueCell = row[index + 1] || cell.split(':')[1];
            if (valueCell && valueCell.trim() !== cellLower) {
              patientInfo.dob = this._cleanPatientValue(valueCell);
            }
          }
        });
      });
    });
  }

  _cleanPatientValue(value) {
    if (!value || typeof value !== 'string') return null;
    return value.trim().replace(/[^\w\s-]/g, '').trim();
  }

  _finalizeReport(pages, reportIndex) {
    return {
      reportIndex,
      pages,
      pageCount: pages.length,
      firstPageIndex: pages[0]?.index || 0,
      lastPageIndex: pages[pages.length - 1]?.index || 0,
      hasPatientData: pages.some(page => this._extractPatientInfo(page) !== null),
      createdAt: new Date().toISOString()
    };
  }

  _validateReports(reports) {
    const validReports = reports.filter(report => {
      if (!report.pages || report.pages.length === 0) {
        console.warn(`Report ${report.reportIndex} has no pages, skipping`);
        return false;
      }
      return true;
    });

    if (validReports.length === 0) {
      throw new Error("No valid reports found after splitting");
    }

    // Log splitting summary
    console.log(`📄 Document split into ${validReports.length} patient reports:`);
    validReports.forEach(report => {
      const firstPage = report.pages[0];
      const patientInfo = this._extractPatientInfo(firstPage);
      const patientDesc = patientInfo?.name || patientInfo?.patientId || 'Unknown Patient';

      console.log(`   Report ${report.reportIndex + 1}: ${report.pageCount} pages (${report.firstPageIndex + 1}-${report.lastPageIndex + 1}) - ${patientDesc}`);
    });

    return validReports;
  }
}