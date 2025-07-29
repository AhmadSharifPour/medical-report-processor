import fs from "fs";
import { PDFDocument } from "pdf-lib";

/**
 * PDF processing utilities
 */
export class PDFProcessor {
  constructor(config) {
    this.config = config;
    this.supportedFormats = config.processing.supportedFormats;
  }

  async loadPDF(filePath) {
    this._validateFile(filePath);
    const raw = fs.readFileSync(filePath);
    return await PDFDocument.load(raw);
  }

  async extractPageBytes(pdfDoc, pageIndex) {
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
      throw new Error(`Page index ${pageIndex} is out of range. Document has ${pdfDoc.getPageCount()} pages.`);
    }

    const singlePagePDF = await PDFDocument.create();
    const [page] = await singlePagePDF.copyPages(pdfDoc, [pageIndex]);
    singlePagePDF.addPage(page);
    return await singlePagePDF.save();
  }

  async createPDFFromPages(pageDataArray) {
    if (!pageDataArray || pageDataArray.length === 0) {
      throw new Error("No page data provided for PDF creation");
    }

    const newPdf = await PDFDocument.create();

    for (const pageData of pageDataArray) {
      if (!pageData.bytes) {
        throw new Error("Page data is missing bytes property");
      }

      const doc = await PDFDocument.load(pageData.bytes);
      const [copied] = await newPdf.copyPages(doc, [0]);
      newPdf.addPage(copied);
    }

    return await newPdf.save();
  }

  getDocumentInfo(pdfDoc) {
    return {
      pageCount: pdfDoc.getPageCount(),
      title: pdfDoc.getTitle(),
      author: pdfDoc.getAuthor(),
      subject: pdfDoc.getSubject(),
      creator: pdfDoc.getCreator(),
      producer: pdfDoc.getProducer(),
      creationDate: pdfDoc.getCreationDate(),
      modificationDate: pdfDoc.getModificationDate()
    };
  }

  _validateFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const extension = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
    if (!this.supportedFormats.includes(extension)) {
      throw new Error(`Unsupported file format: ${extension}. Supported formats: ${this.supportedFormats.join(', ')}`);
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new Error(`File is empty: ${filePath}`);
    }
  }
}