import path from "path";
// @ts-ignore
import mammoth from "mammoth";
// @ts-ignore
import { OfficeParser } from "officeparser";
import * as XLSX from "xlsx";

interface ExtractionResult {
  extractedContentText: string;
  docTypeLabel: string;
}

/**
 * Extracts raw or HTML formatted text from legacy Office documents, CSV, TXT, PDF formats.
 */
export async function extractTextFromOfficeFile(
  base64Data: string,
  mimeType: string,
  fileName?: string
): Promise<ExtractionResult> {
  const fileExt = fileName ? path.extname(fileName).toLowerCase() : "";
  let extractedContentText = "";
  let docTypeLabel = "Tài liệu";

  // 1. WORD DOCUMENT DETECT
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    fileExt === ".docx" ||
    fileExt === ".doc"
  ) {
    docTypeLabel = "Word Document (.docx/.doc)";
    const buffer = Buffer.from(base64Data, "base64");
    try {
      // Convert DOCX to clean HTML using mammoth
      const result = await mammoth.convertToHtml({ buffer });
      extractedContentText = result.value;
    } catch (docxErr: any) {
      console.warn("Mammoth conversion failed, falling back to officeparser:", docxErr);
      try {
        const ast = await OfficeParser.parseOffice(buffer);
        extractedContentText = (await ast.to("text")).value as string;
      } catch (pErr: any) {
        console.error("OfficeParser fallback failed:", pErr);
        throw new Error("Không thể trích xuất dữ liệu từ văn bản Word: " + pErr.message);
      }
    }
  }
  // 2. EXCEL / CSV DETECT
  else if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv" ||
    mimeType === "text/tab-separated-values" ||
    fileExt === ".xlsx" ||
    fileExt === ".xls" ||
    fileExt === ".csv" ||
    fileExt === ".tsv"
  ) {
    docTypeLabel = "Excel Spreadsheet / CSV (.xlsx/.xls/.csv)";
    const buffer = Buffer.from(base64Data, "base64");
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      let sheetHtmls = "";
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const htmlTable = XLSX.utils.sheet_to_html(worksheet);
        sheetHtmls += `\nTrang tính (Sheet): ${sheetName}\n${htmlTable}\n`;
      });
      extractedContentText = sheetHtmls;
    } catch (excelErr: any) {
      console.error("SheetJS Excel parsing failed:", excelErr);
      throw new Error("Không thể trích xuất dữ liệu từ bảng tính Excel: " + excelErr.message);
    }
  }
  // 3. POWERPOINT SLIDES DETECT
  else if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "application/vnd.ms-powerpoint" ||
    fileExt === ".pptx" ||
    fileExt === ".ppt"
  ) {
    docTypeLabel = "PowerPoint Presentation (.pptx/.ppt)";
    const buffer = Buffer.from(base64Data, "base64");
    try {
      const ast = await OfficeParser.parseOffice(buffer);
      extractedContentText = (await ast.to("text")).value as string;
    } catch (pptxErr: any) {
      console.error("OfficeParser PPTX parsing failed:", pptxErr);
      throw new Error("Không thể trích xuất dữ liệu từ slide PowerPoint: " + pptxErr.message);
    }
  }
  // 4. PLAIN TEXT / HTML DETECT
  else if (
    mimeType.startsWith("text/") ||
    fileExt === ".txt" ||
    fileExt === ".md" ||
    fileExt === ".html" ||
    fileExt === ".htm"
  ) {
    docTypeLabel = "Văn bản thường / HTML (.txt/.md/.html)";
    try {
      const buffer = Buffer.from(base64Data, "base64");
      extractedContentText = buffer.toString("utf-8");
    } catch (txtErr: any) {
      console.error("Text file encoding decoding failed:", txtErr);
      throw new Error("Không thể giải mã nội dung tệp tin văn bản.");
    }
  }
  // 5. PDF DETECT
  else if (mimeType === "application/pdf" || fileExt === ".pdf") {
    docTypeLabel = "Tài liệu PDF";
    // Keep empty so we can pass original inlineData directly to Gemini
  }
  // 6. FALLBACK FOR OTHERS
  else {
    docTypeLabel = `Định dạng tệp ${fileExt || "không rõ"}`;
    const buffer = Buffer.from(base64Data, "base64");
    try {
      const ast = await OfficeParser.parseOffice(buffer);
      extractedContentText = (await ast.to("text")).value as string;
    } catch {
      try {
        extractedContentText = buffer.toString("utf-8");
      } catch {
        // No contents extracted, let Gemini try inlineData
      }
    }
  }

  return { extractedContentText, docTypeLabel };
}
