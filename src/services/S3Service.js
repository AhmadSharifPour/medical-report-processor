import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

/**
 * S3 upload service for storing processed reports
 */
export class S3Service {
  constructor(config) {
    this.client = new S3Client({ region: config.aws.region });
    this.bucketName = config.aws.s3BucketName;
    this.region = config.aws.region;
  }

  async uploadReport(pdfBytes, metadata, reportIndex) {
    if (!pdfBytes || pdfBytes.length === 0) {
      throw new Error("PDF bytes are required for upload");
    }

    if (!metadata) {
      throw new Error("Metadata is required for upload");
    }

    // Validate bucket exists before upload
    await this._validateBucket();

    const filename = this._generateFilename(metadata, reportIndex);
    const s3Metadata = this._buildS3Metadata(metadata);

    const uploadParams = {
      Bucket: this.bucketName,
      Key: filename,
      Body: pdfBytes,
      ContentType: 'application/pdf',
      Metadata: s3Metadata
    };

    try {
      const command = new PutObjectCommand(uploadParams);
      const result = await this.client.send(command);

      return {
        success: true,
        filename,
        metadata: s3Metadata,
        etag: result.ETag,
        location: `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${filename}`,
        size: pdfBytes.length
      };
    } catch (error) {
      throw new Error(`S3 upload failed for ${filename}: ${error.message}`);
    }
  }

  async uploadBatch(reports) {
    if (!Array.isArray(reports) || reports.length === 0) {
      throw new Error("Reports array is required for batch upload");
    }

    const results = [];
    const errors = [];

    for (const [index, report] of reports.entries()) {
      try {
        const result = await this.uploadReport(report.pdfBytes, report.metadata, index);
        results.push(result);
      } catch (error) {
        errors.push({ index, error: error.message, metadata: report.metadata });
      }
    }

    return {
      successful: results,
      failed: errors,
      totalAttempted: reports.length,
      successRate: results.length / reports.length
    };
  }

  // Get S3 object URL
  getObjectUrl(filename) {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${filename}`;
  }

  // Set custom bucket name
  setBucketName(bucketName) {
    if (!bucketName || typeof bucketName !== 'string') {
      throw new Error("Valid bucket name is required");
    }
    this.bucketName = bucketName;
  }

  async _validateBucket() {
    try {
      const command = new HeadBucketCommand({ Bucket: this.bucketName });
      await this.client.send(command);
    } catch (error) {
      if (error.name === 'NotFound') {
        throw new Error(`S3 bucket '${this.bucketName}' does not exist`);
      } else if (error.name === 'Forbidden') {
        throw new Error(`Access denied to S3 bucket '${this.bucketName}'`);
      } else {
        throw new Error(`Failed to access S3 bucket '${this.bucketName}': ${error.message}`);
      }
    }
  }

  _generateFilename(metadata, reportIndex) {
    const patientName = metadata.name || `Unknown-${reportIndex}`;
    const timestamp = new Date().toISOString().split('T')[0];
    const safeName = patientName
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50); // Limit length

    const patientId = metadata.patientId ? `_${metadata.patientId}` : '';

    return `${safeName}${patientId}_${timestamp}_${reportIndex}.pdf`;
  }

  _buildS3Metadata(metadata) {
    // S3 metadata values must be strings and have certain character restrictions
    const cleanMetadataValue = (value) => {
      if (value === null || value === undefined) return 'Unknown';
      return String(value).replace(/[^\x20-\x7E]/g, ''); // ASCII only
    };

    return {
      patientName: cleanMetadataValue(metadata.name),
      dateOfBirth: cleanMetadataValue(metadata.dob),
      patientId: cleanMetadataValue(metadata.patientId),
      pageCount: cleanMetadataValue(metadata.pageCount || 0),
      processedDate: new Date().toISOString(),
      extractedFrom: cleanMetadataValue(metadata.extractedFrom),
      extractionMethod: cleanMetadataValue(metadata.extractionMethod),
      confidence: cleanMetadataValue(metadata.confidence?.toFixed(1) || '0'),
      isHighConfidence: cleanMetadataValue(metadata.isHighConfidence || false),
      completeness: cleanMetadataValue(metadata.completeness?.toFixed(2) || '0')
    };
  }
}