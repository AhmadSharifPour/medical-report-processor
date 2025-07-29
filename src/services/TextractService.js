import { TextractClient, AnalyzeDocumentCommand } from "@aws-sdk/client-textract";

/**
 * AWS Textract service wrapper for OCR and structured data extraction
 */
export class TextractService {
  constructor(config) {
    this.client = new TextractClient({ region: config.aws.region });
    this.featureTypes = config.textract.featureTypes;
    this.confidenceThreshold = config.textract.confidenceThreshold;
  }

  async extractData(pdfBytes) {
    try {
      const command = new AnalyzeDocumentCommand({
        Document: { Bytes: pdfBytes },
        FeatureTypes: this.featureTypes
      });

      const response = await this.client.send(command);

      return {
        text: this._extractText(response.Blocks),
        keyValuePairs: this._extractKeyValuePairs(response.Blocks),
        tables: this._extractTables(response.Blocks),
        confidence: this._calculateAverageConfidence(response.Blocks),
        rawBlocks: response.Blocks
      };
    } catch (error) {
      throw new Error(`Textract extraction failed: ${error.message}`);
    }
  }

  _extractText(blocks) {
    return blocks
      .filter(block => block.BlockType === "LINE")
      .map(block => block.Text)
      .join("\n");
  }

  _extractKeyValuePairs(blocks) {
    const keyValuePairs = {};

    blocks
      .filter(block => block.BlockType === "KEY_VALUE_SET")
      .forEach(block => {
        if (block.EntityTypes?.includes("KEY")) {
          const key = this._getBlockText(block, blocks);
          const valueBlock = this._findValueBlock(block, blocks);
          if (valueBlock) {
            const value = this._getBlockText(valueBlock, blocks);
            const cleanKey = key.replace(/[:\s]+$/, '').trim().toLowerCase();
            keyValuePairs[cleanKey] = value.trim();
          }
        }
      });

    return keyValuePairs;
  }

  _extractTables(blocks) {
    const tables = [];
    const tableBlocks = blocks.filter(block => block.BlockType === "TABLE");

    tableBlocks.forEach(tableBlock => {
      const table = {
        rows: [],
        confidence: tableBlock.Confidence
      };

      if (tableBlock.Relationships) {
        const cellRelation = tableBlock.Relationships.find(rel => rel.Type === "CHILD");
        if (cellRelation) {
          const cells = cellRelation.Ids
            .map(id => blocks.find(b => b.Id === id))
            .filter(b => b?.BlockType === "CELL")
            .sort((a, b) => {
              if (a.RowIndex !== b.RowIndex) return a.RowIndex - b.RowIndex;
              return a.ColumnIndex - b.ColumnIndex;
            });

          const rowGroups = {};
          cells.forEach(cell => {
            if (!rowGroups[cell.RowIndex]) rowGroups[cell.RowIndex] = [];
            rowGroups[cell.RowIndex][cell.ColumnIndex - 1] = this._getBlockText(cell, blocks);
          });

          table.rows = Object.values(rowGroups);
        }
      }

      tables.push(table);
    });

    return tables;
  }

  _getBlockText(block, allBlocks) {
    if (!block.Relationships) return "";
    const childIds = block.Relationships
      .find(rel => rel.Type === "CHILD")?.Ids || [];
    return childIds
      .map(id => allBlocks.find(b => b.Id === id))
      .filter(b => b?.BlockType === "WORD")
      .map(b => b.Text)
      .join(" ");
  }

  _findValueBlock(keyBlock, allBlocks) {
    const valueRelation = keyBlock.Relationships
      ?.find(rel => rel.Type === "VALUE");
    if (!valueRelation) return null;
    return allBlocks.find(b => b.Id === valueRelation.Ids[0]);
  }

  _calculateAverageConfidence(blocks) {
    const confidenceScores = blocks
      .filter(b => b.Confidence !== undefined)
      .map(b => b.Confidence);
    if (confidenceScores.length === 0) return 0;
    return confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;
  }
}