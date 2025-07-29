import { Config } from './config/Config.js';
import { TextractService } from './services/TextractService.js';
import { PDFProcessor } from './services/PDFProcessor.js';
import { S3Service } from './services/S3Service.js';
import { MetadataExtractor } from './extractors/MetadataExtractor.js';
import { DocumentSplitter } from './processors/DocumentSplitter.js';

/**
 * Main report processor orchestrating all components
 */
export class ReportProcessor {
  constructor(config = null) {
    this.config = config || new Config();
    this.config.validate();

    // Initialize all services
    this.textractService = new TextractService(this.config);
    this.pdfProcessor = new PDFProcessor(this.config);
    this.metadataExtractor = new MetadataExtractor(this.config);
    this.documentSplitter = new DocumentSplitter(this.config);
    this.s3Service = new S3Service(this.config);
  }

  async processReport(pdfPath) {
    console.log(`📄 Starting processing of ${pdfPath}...`);

    const startTime = Date.now();

    try {
      // Load and validate PDF
      const pdfDoc = await this.pdfProcessor.loadPDF(pdfPath);
      const docInfo = this.pdfProcessor.getDocumentInfo(pdfDoc);
      const totalPages = pdfDoc.getPageCount();

      console.log(`📄 Processing ${totalPages} pages...`);
      console.log(`📋 Document info: ${docInfo.title || 'Untitled'} (${docInfo.pageCount} pages)`);

      // Extract data from each page
      const pageDataArray = await this._extractPageData(pdfDoc, totalPages);

      // Split into patient reports
      const patientReports = this.documentSplitter.splitIntoPatientReports(pageDataArray);

      console.log(`📋 Found ${patientReports.length} patient reports.`);

      // Process and upload each report
      const results = await this._processPatientReports(patientReports);

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`🎉 Processing complete in ${processingTime}s! Uploaded ${results.filter(r => !r.error).length} patient reports.`);

      return {
        success: true,
        totalPages,
        reportsFound: patientReports.length,
        reportsProcessed: results.filter(r => !r.error).length,
        reportsFailed: results.filter(r => r.error).length,
        processingTimeSeconds: parseFloat(processingTime),
        results,
        documentInfo: docInfo
      };

    } catch (error) {
      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`❌ Processing failed after ${processingTime}s: ${error.message}`);

      return {
        success: false,
        error: error.message,
        processingTimeSeconds: parseFloat(processingTime)
      };
    }
  }

  // Process multiple files in batch
  async processBatch(pdfPaths) {
    if (!Array.isArray(pdfPaths) || pdfPaths.length === 0) {
      throw new Error("PDF paths array is required for batch processing");
    }

    console.log(`📦 Starting batch processing of ${pdfPaths.length} files...`);

    const batchResults = [];

    for (const [index, pdfPath] of pdfPaths.entries()) {
      console.log(`\n📄 Processing file ${index + 1}/${pdfPaths.length}: ${pdfPath}`);

      try {
        const result = await this.processReport(pdfPath);
        batchResults.push({ file: pdfPath, ...result });
      } catch (error) {
        console.error(`❌ Failed to process ${pdfPath}: ${error.message}`);
        batchResults.push({
          file: pdfPath,
          success: false,
          error: error.message
        });
      }
    }

    const successful = batchResults.filter(r => r.success);
    const failed = batchResults.filter(r => !r.success);

    console.log(`\n📊 Batch processing complete:`);
    console.log(`   ✅ Successful: ${successful.length}/${pdfPaths.length}`);
    console.log(`   ❌ Failed: ${failed.length}/${pdfPaths.length}`);

    return {
      totalFiles: pdfPaths.length,
      successful: successful.length,
      failed: failed.length,
      results: batchResults
    };
  }

  // Get processing statistics
  getStats() {
    return {
      config: {
        region: this.config.aws.region,
        bucket: this.config.aws.s3BucketName,
        confidenceThreshold: this.config.textract.confidenceThreshold
      },
      services: {
        textract: this.textractService.constructor.name,
        pdf: this.pdfProcessor.constructor.name,
        metadata: this.metadataExtractor.constructor.name,
        splitter: this.documentSplitter.constructor.name,
        storage: this.s3Service.constructor.name
      }
    };
  }

  async _extractPageData(pdfDoc, totalPages) {
    const pageDataArray = [];

    for (let i = 0; i < totalPages; i++) {
      try {
        const pageBytes = await this.pdfProcessor.extractPageBytes(pdfDoc, i);
        const extractedData = await this.textractService.extractData(pageBytes);

        const pageData = {
          index: i,
          bytes: pageBytes,
          ...extractedData
        };

        pageDataArray.push(pageData);

        console.log(
          `✅ Page ${i + 1} processed - ` +
          `Confidence: ${extractedData.confidence.toFixed(1)}% - ` +
          `KV Pairs: ${Object.keys(extractedData.keyValuePairs).length} - ` +
          `Tables: ${extractedData.tables.length}`
        );
      } catch (error) {
        console.error(`❌ Failed to process page ${i + 1}: ${error.message}`);
        // Continue with other pages
      }
    }

    if (pageDataArray.length === 0) {
      throw new Error("No pages could be processed successfully");
    }

    return pageDataArray;
  }

  async _processPatientReports(patientReports) {
    const results = [];

    for (const report of patientReports) {
      const reportIndex = report.reportIndex;
      console.log(`📤 Processing report ${reportIndex + 1}/${patientReports.length}...`);

      try {
        // Create PDF for this patient (combining all their pages)
        console.log(`   📄 Combining ${report.pageCount} pages into single PDF for patient...`);
        const reportPdf = await this.pdfProcessor.createPDFFromPages(report.pages);

        // Extract metadata from first page
        const metadata = this.metadataExtractor.extractMetadata(report.pages[0]);
        metadata.pageCount = report.pageCount;

        // Upload to S3
        console.log(`   ☁️  Uploading ${Math.round(reportPdf.length / 1024)}KB PDF to S3...`);
        const uploadResult = await this.s3Service.uploadReport(reportPdf, metadata, reportIndex);

        console.log(`✅ Uploaded complete patient report: ${uploadResult.filename}`);
        console.log(`   📋 Patient: ${metadata.name || 'Unknown'}`);
        console.log(`   🎂 DOB: ${metadata.dob || 'Unknown'}`);
        console.log(`   🆔 ID: ${metadata.patientId || 'Unknown'}`);
        console.log(`   📄 Pages Combined: ${metadata.pageCount}`);
        console.log(`   📁 File Size: ${Math.round(uploadResult.size / 1024)}KB`);
        console.log(`   🎯 Confidence: ${metadata.confidence?.toFixed(1)}% - Completeness: ${(metadata.completeness * 100).toFixed(1)}%`);

        results.push({
          reportIndex,
          metadata,
          uploadResult,
          pageCount: report.pageCount,
          success: true
        });

      } catch (error) {
        console.error(`❌ Failed to process report ${reportIndex + 1}:`, error.message);
        results.push({
          reportIndex,
          error: error.message,
          pageCount: report.pageCount,
          success: false
        });
      }
    }

    return results;
  }
}