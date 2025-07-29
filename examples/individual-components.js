import {
  Config,
  TextractService,
  PDFProcessor,
  MetadataExtractor,
  DocumentSplitter,
  S3Service
} from '../src/index.js';

/**
 * Example of using individual components separately
 * This gives you full control over each step of the process
 */
async function demonstrateIndividualComponents() {
  console.log("🔧 Demonstrating individual component usage...\n");

  // 1. Setup configuration
  const config = new Config();
  config.merge({
    aws: {
      region: "us-east-1",
      s3BucketName: "reports-bk"
    },
    textract: {
      confidenceThreshold: 85
    }
  });

  console.log("📋 Configuration:");
  console.log(`   Region: ${config.aws.region}`);
  console.log(`   Bucket: ${config.aws.s3BucketName}`);
  console.log(`   Confidence Threshold: ${config.textract.confidenceThreshold}%\n`);

  // 2. Initialize individual services
  const pdfProcessor = new PDFProcessor(config);
  const textractService = new TextractService(config);
  const metadataExtractor = new MetadataExtractor(config);
  const documentSplitter = new DocumentSplitter(config);
  const s3Service = new S3Service(config);

  try {
    // 3. Process a single page manually
    console.log("📄 Loading PDF...");
    const pdfDoc = await pdfProcessor.loadPDF("../sample-multi-patient-lab-report.pdf");
    const docInfo = pdfProcessor.getDocumentInfo(pdfDoc);

    console.log(`📊 Document Info:`);
    console.log(`   Pages: ${docInfo.pageCount}`);
    console.log(`   Title: ${docInfo.title || 'N/A'}`);
    console.log(`   Creator: ${docInfo.creator || 'N/A'}\n`);

    // 4. Extract first page for demonstration
    console.log("🔍 Extracting first page...");
    const firstPageBytes = await pdfProcessor.extractPageBytes(pdfDoc, 0);

    // 5. Run Textract on the page
    console.log("📝 Running Textract analysis...");
    const textractData = await textractService.extractData(firstPageBytes);

    console.log(`📊 Textract Results:`);
    console.log(`   Confidence: ${textractData.confidence.toFixed(1)}%`);
    console.log(`   Key-Value Pairs: ${Object.keys(textractData.keyValuePairs).length}`);
    console.log(`   Tables: ${textractData.tables.length}`);
    console.log(`   Text Length: ${textractData.text.length} characters\n`);

    // 6. Extract metadata
    console.log("🏷️ Extracting metadata...");
    const pageData = {
      index: 0,
      bytes: firstPageBytes,
      ...textractData
    };

    const metadata = metadataExtractor.extractMetadata(pageData);

    console.log(`👤 Patient Metadata:`);
    console.log(`   Name: ${metadata.name || 'Not found'}`);
    console.log(`   DOB: ${metadata.dob || 'Not found'}`);
    console.log(`   Patient ID: ${metadata.patientId || 'Not found'}`);
    console.log(`   Completeness: ${(metadata.completeness * 100).toFixed(1)}%`);
    console.log(`   High Confidence: ${metadata.isHighConfidence ? 'Yes' : 'No'}\n`);

    // 7. Demonstrate field mapping customization
    console.log("⚙️ Customizing field mappings...");
    const originalMappings = metadataExtractor.getFieldMappings();
    console.log(`   Original name mappings: ${originalMappings.name.length} variations`);

    // Add custom field mapping
    metadataExtractor.setFieldMappings({
      name: [...originalMappings.name, 'full patient name', 'pt name']
    });

    const updatedMappings = metadataExtractor.getFieldMappings();
    console.log(`   Updated name mappings: ${updatedMappings.name.length} variations\n`);

    // 8. Demonstrate document splitting logic
    console.log("✂️ Demonstrating document splitting...");

    // For demo, let's say we have 3 pages of data (normally you'd process all pages)
    const mockPageDataArray = [pageData, pageData, pageData].map((data, index) => ({
      ...data,
      index
    }));

    const patientReports = documentSplitter.splitIntoPatientReports(mockPageDataArray);
    console.log(`   Split into: ${patientReports.length} reports`);

    patientReports.forEach(report => {
      console.log(`   Report ${report.reportIndex + 1}: ${report.pageCount} pages`);
    });

    // 9. Demonstrate S3 service capabilities
    console.log("\n☁️ S3 Service capabilities:");
    console.log(`   Bucket: ${s3Service.bucketName}`);
    console.log(`   Region: ${s3Service.region}`);

    // Generate a sample filename
    const sampleFilename = s3Service._generateFilename(metadata, 0);
    const sampleUrl = s3Service.getObjectUrl(sampleFilename);
    console.log(`   Sample filename: ${sampleFilename}`);
    console.log(`   Sample URL: ${sampleUrl}`);

    console.log("\n✅ Individual component demonstration complete!");

  } catch (error) {
    console.error(`❌ Error during demonstration: ${error.message}`);
  }
}

// Run the demonstration
demonstrateIndividualComponents();