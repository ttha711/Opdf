import { Router, Request, Response } from "express";
import { generateContentWithFallback, formatGeminiError } from "../gemini";
import { extractTextFromOfficeFile } from "../officeParser";
import { validate } from "../middleware/validate";
// @ts-ignore
import HTMLtoDOCX from "html-to-docx";
// @ts-ignore
import juice from "juice";

const router = Router();

// Convert legacy Office document, CSV, TXT, PDF formats into editable multi-format layout blocks using Gemini
router.post("/convert-office", validate([
  { field: "fileBase64", type: "string", required: true, message: "Không tìm thấy nội dung tệp tin." },
  { field: "mimeType", type: "string", required: true, message: "Thiếu định dạng tệp tin MimeType." }
]), async (req: Request, res: Response) => {
  try {
    const { fileBase64, mimeType, fileName } = req.body;

    // Clean base64 header if present
    const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, "");

    // Extract text contents using modular physical parser
    const { extractedContentText, docTypeLabel } = await extractTextFromOfficeFile(
      base64Data,
      mimeType,
      fileName
    );

    const systemPrompt = `Bạn là một trí tuệ nhân tạo chuyên gia trong việc đọc, phân tích và chuyển đổi cấu trúc các tệp tin tài liệu Microsoft Office (Word docx, Excel xlsx, PowerPoint pptx), PDF, CSV, và văn bản thô (txt, html) thành định dạng JSON có cấu trúc chuẩn BlockOffice.

Nhiệm vụ của bạn:
1. Đọc và phân hóa toàn bộ nội dung của tệp tin đính kèm dưới đây.
2. Trích xuất chính xác các phần tử: Tiêu đề, đề mục (heading), các đoạn văn (paragraph), các hộp lưu ý nổi bật (callout), các bảng biểu dữ liệu (table), các biểu đồ so sánh (chart) đại diện cho bảng đó, và slide thuyết trình (slide).
3. Biến đổi dữ liệu thành một cấu trúc JSON duy nhất đạt chuẩn AIParsedDocument:
{
  "title": "Tiêu đề tài liệu hợp lý trích xuất được hoặc dựa trên tên tệp tin",
  "description": "Mô tả ngắn gọn về tài liệu này",
  "theme": "corporate" | "minimalist" | "warm" | "modern",
  "blocks": [
    {
      "id": "chuỗi_id_ngẫu_nhiên",
      "type": "heading" | "paragraph" | "table" | "chart" | "callout" | "slide" | "page-break",
      "content": "Nội dung văn bản tương ứng (cho heading, paragraph, callout, slide)",
      "meta": {
        "level": 1 | 2 | 3,  // nếu type là heading (h1=1, h2=2, h3=3)
        "style": "",         // tùy chọn thêm inline style
        "chartType": "bar" | "line" | "pie", // nếu type là chart, mặc định là bar
        "chartDataKeys": ["trục_X_key_thường_cột_0", "trục_Y_key_cột_1", "..."], // ví dụ ["Quý", "Doanh thu", "Chi phí"] liên kết trực tiếp với các cột trong block "table" đứng ngay trước đó.
        "calloutType": "info" | "warning" | "success" | "danger", // nếu type là callout
        "bulletPoints": ["Gạch đầu dòng 1", "Gạch đầu dòng 2", "..."] // dành cho slide hoặc văn bản danh sách
      },
      "tableData": [
        // Bảng dữ liệu hai chiều đại diện Excel: [Hàng][Cột]. Mỗi bảng gồm có các hàng tiêu đề và hàng số liệu. Cực kỳ quan trọng:
        // Hãy cấu trúc đầy đủ hàng, cột để render table HTML.
        // Hãy cố gắng giữ nguyên giá trị nguyên thủy (số hoặc chuỗi) và nếu hàng cuối có các trường tính tổng/trung bình, CHUYỂN HOÁ thành công thức Excel (ví dụ "=SUM(B2:B5)" hay "=AVERAGE(C2:C10)") bắt đầu bằng dấu "=" để bảng tính có thể tự động tính toán.
        [
          { "value": "Tên Cột 1", "formula": "" },
          { "value": "Tên Cột 2", "formula": "" }
        ],
        [
          { "value": "Nhãn sô hoặc chữ", "formula": "" },
          { "value": "15000", "formula": "" }
        ],
        [
          { "value": "Tổng cộng", "formula": "" },
          { "value": "15000", "formula": "=SUM(B2:B2)" } // Ví dụ công thức SUM tự động co dãn theo đúng bảng của bạn
        ]
      ]
    }
  ]
}

Nguyên tắc chuyển đổi thông minh:
- Nếu file là Word (.docx, .doc) hoặc Văn bản: Tập trung trích xuất thành các blocks heading, paragraph, callout và có xen kẽ bảng dữ liệu nếu có. Cuối tài liệu có thể tạo thêm 1-2 slides tóm tắt nội dung chính.
- Nếu file là Excel (.xlsx, .xls) hoặc CSV: Chuyển toàn bộ các trang tính / dữ liệu thành blocks "table" đại diện cho Excel. Hãy tạo công thức tính toán khoa học. Đồng thời thêm ít nhất 1 block "chart" đi kèm ở dưới để vẽ biểu đồ trực quan từ bảng dữ liệu. Thêm 1 block heading/paragraph thuyết minh lúc đầu.
- Nếu file là PowerPoint (.pptx): Chuyển đổi thành các blocks mang type: "slide" một cách mượt mà nhất, kèm 1 blocks heading lớn ở đầu làm bìa giáo án.
- Nếu file là PDF hoặc định dạng hỗn hợp: Đọc toàn diện tất cả các bảng biểu, đề mục, chữ nghĩa, slide và cấu trúc hài hòa đầy đủ các khối blocks.

Trả về DUY NHẤT một chuỗi JSON chuẩn cú pháp ứng với cấu trúc trên. Không chứa bất kỳ cụm ký tự bao gói markdown nào (\`\`\`json) và không giải thích gì thêm.`;

    const parts: any[] = [];

    if (extractedContentText) {
      // Safe from Unsupported MIME Type errors! Deliver text/HTML representation directly to Gemini prompt.
      parts.push({
        text: `${systemPrompt}\n\nTên tệp tin gốc: "${fileName}"\nCấu trúc tệp ban đầu được xác định là: ${docTypeLabel}\n\nDưới đây là toàn bộ cấu trúc dữ liệu / văn bản / bảng biểu HTML được trích xuất từ tệp tin gốc này:\n\n=== NỘI DUNG TRÍCH XUẤT ===\n${extractedContentText}\n=== HẾT NỘI DUNG ===\n\nHãy đọc kỹ dữ liệu trích xuất trên, sau đó chuyển hoá và gộp toàn bộ vào đúng tệp JSON sơ đồ cấu trúc BlockOffice chuẩn mực.`,
      });
    } else {
      // Fallback for native formats e.g. PDF supported directly by Gemini
      parts.push({
        text: `${systemPrompt}\n\nTên tệp tin gốc: "${fileName}"\nĐịnh dạng MIME: "${mimeType}"\nHãy phân tích tệp đính kèm và trả về JSON cấu trúc kết quả.`,
      });
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      });
    }

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: parts,
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const responseText = response.text || "{}";
    const parsedData = JSON.parse(responseText.trim());
    return res.json(parsedData);
  } catch (error: any) {
    console.error("Office Document Conversion Error:", error);
    return res.status(550).json({ error: formatGeminiError(error) });
  }
});

// Export HTML content to Microsoft Word (.docx)
router.post("/export-docx", validate([{ field: "html", type: "string", required: true, message: "Thiếu nội dung HTML để xuất DOCX." }]), async (req: Request, res: Response) => {
  try {
    const { html, title } = req.body;
    let processedHtml = html || "";
    // Convert interactive checkboxes to nice static symbols for Word
    processedHtml = processedHtml.replace(/<input\s+[^>]*type="checkbox"[^>]*checked[^>]*>/gi, "☑ ");
    processedHtml = processedHtml.replace(/<input\s+[^>]*checked[^>]*type="checkbox"[^>]*>/gi, "☑ ");
    processedHtml = processedHtml.replace(/<input\s+[^>]*type="checkbox"[^>]*>/gi, "☐ ");

    // Add clean styles that html-to-docx supports and prefers
    const styledHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.25; color: #333333; }
          h1 { font-size: 20pt; font-weight: bold; margin-bottom: 12pt; color: #1F4E79; border-bottom: 2px solid #2E74B5; padding-bottom: 6px; }
          h2 { font-size: 15pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; color: #2E74B5; }
          h3 { font-size: 12pt; font-weight: bold; margin-top: 14pt; margin-bottom: 4pt; color: #418AB3; }
          p { margin-bottom: 6pt; line-height: 1.25; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; }
          th, td { border: 1px solid #CCCCCC; padding: 6px; text-align: left; font-size: 10pt; }
          th { background-color: #F2F2F2; font-weight: bold; }
          ul, ol { margin-left: 18pt; margin-bottom: 12pt; }
          li { margin-bottom: 4pt; }
          img { max-width: 100%; height: auto; display: block; margin: 12pt auto; border-radius: 4px; }
          blockquote { border-left: 3px solid #CCCCCC; padding-left: 10pt; margin-left: 0; color: #666666; font-style: italic; margin-bottom: 12pt; }
          pre, code { font-family: 'Consolas', 'Courier New', monospace; background-color: #F5F5F5; font-size: 9.5pt; }
          pre { padding: 8px; border: 1px solid #E2E8F0; border-radius: 4px; overflow-x: auto; margin-bottom: 12pt; }
          a { color: #0563C1; text-decoration: underline; }
          hr { border: none; border-top: 1px solid #E2E8F0; margin: 16pt 0; }
        </style>
      </head>
      <body>
        ${processedHtml}
      </body>
      </html>
    `;

    const options = {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      title: title || "Exported Document",
    };

    // Inline the styles so html-to-docx can read them as inline attributes
    let inlinedHtml = juice(styledHtml);

    // MS Word XML parser does not support rgb(r, g, b) background colors properly, only hex colors.
    // Convert any rgb(...) colors to hex strings.
    inlinedHtml = inlinedHtml.replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g, (match: string, r: string, g: string, b: string) => {
      const hex = ((1 << 24) + (parseInt(r) << 16) + (parseInt(g) << 8) + parseInt(b))
        .toString(16)
        .slice(1);
      return `#${hex}`;
    });

    // @ts-ignore
    const fileBuffer = await HTMLtoDOCX(inlinedHtml, null, options);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(title || "document")}.docx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    return res.send(fileBuffer);
  } catch (error: any) {
    console.error("Error creating DOCX:", error);
    return res.status(500).json({ error: error.message || "Failed to create DOCX file." });
  }
});

// AI Analyst for Excel Spreadsheets to recommend charts & explain data
router.post("/excel-analyze", validate([{ field: "tableData", type: "array", required: true, min: 1, message: "Thiếu dữ liệu bảng để phân tích." }]), async (req: Request, res: Response) => {
  try {
    const { tableData, tableName } = req.body;

    const textData = tableData.map(row => row.map(c => c.value).join(" | ")).join("\n");

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a financial and data analyst AI.
Analyze this Excel table data (Table Name: "${tableName || "Data Sheet"}"):

${textData}

Tasks:
1. Provide a very concise professional summary/insights of this table in Vietnamese (maximum 2 sentences).
2. Recommend the best chart type to visualize this table data ('bar', 'line', or 'pie').
3. Define the chart data keys representing the columns (first column is usually the X-axis label, and subsequent columns are the numeric values to plot, e.g. ["Tháng", "Doanh thu", "Lợi nhuận"]). The keys MUST match the exact column names present in the first row of the table.

Return ONLY a JSON object with this exact schema (no markdown, no explanations):
{
  "analysis": "Lời phân tích tóm tắt dữ liệu bằng tiếng Việt...",
  "chartType": "bar" | "line" | "pie",
  "chartDataKeys": ["Tên Cột X", "Tên Cột Y1", ...]
}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.15,
      },
    });

    const responseText = response.text || "{}";
    const result = JSON.parse(responseText.trim());
    return res.json(result);
  } catch (error: any) {
    console.error("Excel AI analysis error:", error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
