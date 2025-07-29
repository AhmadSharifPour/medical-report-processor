/**
 * Patient metadata extraction from Textract data
 */
export class MetadataExtractor {
  constructor(config) {
    this.confidenceThreshold = config.textract.confidenceThreshold;

    this.fieldMappings = {
      name: ['patient name', 'name', 'patient', 'full name', 'patient full name'],
      dob: ['dob', 'date of birth', 'birth date', 'birthdate', 'patient dob'],
      patientId: [
        'patient id', 'id', 'patient #', 'patient number', 'mrn',
        'medical record number', 'account', 'accession', 'medical record no',
        'patient identifier', 'chart number'
      ]
    };
  }

  extractMetadata(pageData) {
    if (!pageData) {
      throw new Error("No page data provided for metadata extraction");
    }

    const { keyValuePairs, tables, confidence, index } = pageData;

    const metadata = {
      name: null,
      dob: null,
      patientId: null,
      confidence: confidence || 0,
      extractedFrom: `page_${index ?? 'unknown'}`,
      extractionMethod: 'textract_structured',
      isHighConfidence: (confidence || 0) >= this.confidenceThreshold
    };

    // Extract from key-value pairs (most reliable)
    this._extractFromKeyValuePairs(keyValuePairs || {}, metadata);

    // Fallback to table data if needed
    if (this._hasIncompleteData(metadata) && tables && tables.length > 0) {
      this._extractFromTables(tables, metadata);
    }

    // Final validation and scoring
    metadata.completeness = this._calculateCompleteness(metadata);

    return metadata;
  }

  // Allow custom field mappings
  setFieldMappings(customMappings) {
    this.fieldMappings = { ...this.fieldMappings, ...customMappings };
  }

  // Get available field mappings
  getFieldMappings() {
    return { ...this.fieldMappings };
  }

  _extractFromKeyValuePairs(keyValuePairs, metadata) {
    for (const [field, possibleKeys] of Object.entries(this.fieldMappings)) {
      for (const key of possibleKeys) {
        if (keyValuePairs[key] && !metadata[field]) {
          metadata[field] = this._cleanValue(keyValuePairs[key], field);
          break;
        }
      }
    }
  }

  _extractFromTables(tables, metadata) {
    tables.forEach(table => {
      if (!table.rows) return;

      table.rows.forEach(row => {
        if (!Array.isArray(row)) return;

        row.forEach((cell, index) => {
          if (!cell || typeof cell !== 'string') return;

          const cellLower = cell.toLowerCase();

          for (const [field, possibleKeys] of Object.entries(this.fieldMappings)) {
            if (metadata[field]) continue;

            if (possibleKeys.some(key => cellLower.includes(key))) {
              const valueCell = row[index + 1] || cell.split(':')[1] || cell.split(' ').slice(-1)[0];
              if (valueCell && valueCell.trim() !== cellLower) {
                metadata[field] = this._cleanValue(valueCell, field);
              }
            }
          }
        });
      });
    });
  }

  _cleanValue(value, field) {
    if (!value || typeof value !== 'string') return null;

    let cleaned = value.trim();

    if (field === 'name') {
      // Remove non-alphanumeric characters except spaces and hyphens
      cleaned = cleaned.replace(/[^\w\s-]/g, '').trim();
      // Ensure it's not just numbers or too short
      if (cleaned.length < 2 || /^\d+$/.test(cleaned)) {
        return null;
      }
    } else if (field === 'dob') {
      // Basic date validation - ensure it contains numbers and separators
      if (!/\d/.test(cleaned) || cleaned.length < 6) {
        return null;
      }
    } else if (field === 'patientId') {
      // Remove spaces and special characters, keep alphanumeric
      cleaned = cleaned.replace(/[^\w]/g, '');
      if (cleaned.length < 3) {
        return null;
      }
    }

    return cleaned;
  }

  _hasIncompleteData(metadata) {
    return !metadata.name || !metadata.dob || !metadata.patientId;
  }

  _calculateCompleteness(metadata) {
    const fields = ['name', 'dob', 'patientId'];
    const completedFields = fields.filter(field => metadata[field] && metadata[field].length > 0);
    return completedFields.length / fields.length;
  }
}