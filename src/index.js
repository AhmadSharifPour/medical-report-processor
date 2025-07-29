import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Export all classes
export { Config } from './config/Config.js';
export { TextractService } from './services/TextractService.js';
export { PDFProcessor } from './services/PDFProcessor.js';
export { S3Service } from './services/S3Service.js';
export { MetadataExtractor } from './extractors/MetadataExtractor.js';
export { DocumentSplitter } from './processors/DocumentSplitter.js';
export { ReportProcessor } from './ReportProcessor.js';

// Re-export main classes for convenience
import { Config } from './config/Config.js';
import { ReportProcessor } from './ReportProcessor.js';

/**
 * Factory function for easy instantiation with custom configuration
 */
export function createReportProcessor(customConfig = {}) {
  const config = new Config();
  config.merge(customConfig);
  return new ReportProcessor(config);
}

/**
 * Factory function to create processor with environment-based config
 */
export function createReportProcessorFromEnv() {
  const config = new Config();

  // Override with any environment variables
  if (process.env.AWS_REGION) config.aws.region = process.env.AWS_REGION;
  if (process.env.S3_BUCKET_NAME) config.aws.s3BucketName = process.env.S3_BUCKET_NAME;
  if (process.env.TEXTRACT_CONFIDENCE_THRESHOLD) {
    config.textract.confidenceThreshold = parseInt(process.env.TEXTRACT_CONFIDENCE_THRESHOLD, 10);
  }
  if (process.env.MAX_PAGES_PER_PATIENT) {
    config.processing.maxPagesPerPatient = parseInt(process.env.MAX_PAGES_PER_PATIENT, 10);
  }

  return new ReportProcessor(config);
}

/**
 * Simplified processor for basic use cases
 */
export function createBasicProcessor(bucketName, region = 'us-east-1') {
  return createReportProcessor({
    aws: {
      region,
      s3BucketName: bucketName
    },
    textract: {
      confidenceThreshold: 80
    }
  });
}

// Default export for common usage
export default createReportProcessor;

/**
 * Show command line help
 */
function showHelp() {
  console.log("🏥 Medical Report Processor - Modular Architecture");
  console.log("=" .repeat(55));
  console.log("");
  console.log("USAGE:");
  console.log("  node src/index.js [PDF_FILE_PATH]");
  console.log("  npm start [PDF_FILE_PATH]");
  console.log("");
  console.log("EXAMPLES:");
  console.log("  node src/index.js                                    # Process default sample file");
  console.log("  node src/index.js lab-reports.pdf                   # Process specific file");
  console.log("  npm start my-faxed-reports.pdf                      # Using npm script");
  console.log("");
  console.log("ENVIRONMENT VARIABLES:");
  console.log("  AWS_REGION                    AWS region (default: us-east-1)");
  console.log("  S3_BUCKET_NAME               S3 bucket for uploads (default: reports-bk)");
  console.log("  TEXTRACT_CONFIDENCE_THRESHOLD Minimum confidence % (default: 80)");
  console.log("  MAX_PAGES_PER_PATIENT        Max pages per patient (default: 10)");
  console.log("");
  console.log("OTHER COMMANDS:");
  console.log("  npm test                                             # Test document splitting logic");
  console.log("  npm run demo:components                              # Demo individual components");
  console.log("  npm run demo:individual                              # Same as demo:components");
  console.log("");
  console.log("REQUIRED:");
  console.log("  - AWS credentials configured (AWS CLI, env vars, or IAM role)");
  console.log("  - S3 bucket must exist and be accessible");
  console.log("  - .env file with required AWS configuration");
}

/**
 * Main execution when this file is run directly
 */
async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  console.log("🏥 Medical Report Processor - Modular Architecture");
  console.log("=" .repeat(55));

  try {
    // Create processor with environment-based configuration
    const processor = createReportProcessorFromEnv();

    // Get file path from arguments
    const filePath = args[0] || "sample-multi-patient-lab-report.pdf";

    console.log(`📄 Processing file: ${filePath}`);
    console.log(`🔧 Configuration: ${processor.config.aws.region} region, ${processor.config.aws.s3BucketName} bucket`);
    console.log("");

    // Process the report
    const results = await processor.processReport(filePath);

    // Display summary
    if (results.success) {
      console.log("\n" + "=".repeat(55));
      console.log("📊 PROCESSING SUMMARY");
      console.log("=".repeat(55));
      console.log(`✅ Success: ${results.success}`);
      console.log(`📄 Total Pages: ${results.totalPages}`);
      console.log(`📋 Reports Found: ${results.reportsFound}`);
      console.log(`🎯 Reports Processed: ${results.reportsProcessed}`);
      console.log(`❌ Reports Failed: ${results.reportsFailed}`);
      console.log(`⏱️  Processing Time: ${results.processingTimeSeconds}s`);

      if (results.results && results.results.length > 0) {
        console.log("\n📋 Patient Details:");
        results.results.forEach((result, index) => {
          if (result.success && result.metadata) {
            console.log(`   ${index + 1}. ${result.metadata.name || 'Unknown'} (${result.metadata.patientId || 'No ID'}) - ${result.pageCount} pages`);
            console.log(`      📍 Uploaded: ${result.uploadResult?.filename || 'N/A'}`);
            console.log(`      🎯 Confidence: ${result.metadata.confidence?.toFixed(1) || 'N/A'}%`);
          } else {
            console.log(`   ${index + 1}. ❌ Failed: ${result.error}`);
          }
        });
      }
    } else {
      console.log("\n❌ Processing failed:");
      console.log(`   Error: ${results.error}`);
      console.log(`   Time: ${results.processingTimeSeconds}s`);
    }

  } catch (error) {
    console.error("\n❌ Fatal error:", error.message);
    process.exit(1);
  }
}

// Run main function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  });
}