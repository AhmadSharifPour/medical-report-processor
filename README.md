# Medical Report Processor

[![Node.js](https://img.shields.io/badge/Node.js-14%2B-green.svg)](https://nodejs.org/)
[![AWS](https://img.shields.io/badge/AWS-Textract%20%26%20S3-orange.svg)](https://aws.amazon.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A modern medical document processing system that automatically splits multi-patient lab reports using AWS Textract OCR and uploads individual patient reports to S3 with extracted metadata.

## ✨ Features

- **AWS Textract OCR Integration** - Professional-grade document text extraction
- **Smart Document Splitting** - Automatically separates multi-patient documents
- **Metadata Extraction** - Extracts patient name, DOB, patient ID, and other key information
- **S3 Storage** - Automated upload with rich metadata tagging
- **Form & Table Processing** - Handles structured medical forms and data tables

## 🚀 Quick Start

### Prerequisites

- Node.js 14+
- AWS Account with Textract and S3 access
- AWS credentials configured (CLI, environment variables, or IAM role)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/medical-report-processor.git
   cd medical-report-processor
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your AWS credentials and settings
   ```

### Basic Usage

```bash
# Process the included sample file
npm start

# Process your own file
npm start path/to/your/reports.pdf

# Show help and options
npm start -- --help
```