/**
 * Configuration class for managing application settings
 */
export class Config {
  constructor() {
    this.aws = {
      region: process.env.AWS_REGION || "us-east-1",
      s3BucketName: process.env.S3_BUCKET_NAME || "reports-bk"
    };

    this.textract = {
      featureTypes: ["FORMS", "TABLES"],
      confidenceThreshold: 80
    };

    this.processing = {
      maxPagesPerPatient: 10,
      supportedFormats: ['.pdf']
    };
  }

  // Method to merge custom configuration
  merge(customConfig) {
    if (customConfig.aws) {
      Object.assign(this.aws, customConfig.aws);
    }
    if (customConfig.textract) {
      Object.assign(this.textract, customConfig.textract);
    }
    if (customConfig.processing) {
      Object.assign(this.processing, customConfig.processing);
    }
    return this;
  }

  // Validation method
  validate() {
    const required = ['AWS_REGION', 'S3_BUCKET_NAME'];
    const missing = required.filter(key => !process.env[key] && !this.aws[key.toLowerCase().replace('_', '')]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}