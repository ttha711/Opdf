import { Router, Request, Response } from "express";
import { generateContentWithFallback, formatGeminiError } from "../gemini";
import { validate, sanitizeHtml } from "../middleware/validate";

const router = Router();

// AI-assisted text editor / layout changer
router.post("/edit-html", validate([
  { field: "htmlContent", type: "string", required: true, message: "Thiếu nội dung HTML để chỉnh sửa." },
  { field: "prompt", type: "string", required: true, min: 1, message: "Thiếu yêu cầu chỉnh sửa." }
]), async (req: Request, res: Response) => {
  try {
    const { prompt, context } = req.body;
    const htmlContent = sanitizeHtml(req.body.htmlContent);

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an expert document formatter and office-editor AI.
Your task is to modify, restyle, or format the following selected HTML or text according to the user's manual-editing request:
User request: "${prompt}"

Current selected HTML or text:
${htmlContent}

${context ? `The surrounding document context is:\n${context}` : ""}

Please perform the layout/formatting change (e.g., altering font-weight, color, text alignment, indentation, converting text to lists or tables, translating, rephrasing, or adding highlighting).
Apply CSS inline styles (like style="color: ...; text-align: ...; font-weight: ...; font-style: ...; text-decoration: ...; background-color: ...; padding: ...; margin: ...;") directly to the tags as needed.
If a selection is standard text and the instruction asks to wrap or style it, make sure to return styled spans or tags where appropriate.
If transforming blocks of text, you can change the HTML elements accordingly.
Return ONLY the raw HTML string representing the replacement. Do NOT include markdown blocks (\`\`\`html) or explanation.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction:
          "You are a high-fidelity document editor engine. Your output replaces selected text in place. Return ONLY raw HTML fragment, no markdown delimiters or outer layout tags.",
        temperature: 0.1,
      },
    });

    let updatedHtml = response.text || "";

    // Cleanup markdown wraps if model generated any
    if (updatedHtml.startsWith("```html")) {
      updatedHtml = updatedHtml.replace(/^```html\n?/, "");
      updatedHtml = updatedHtml.replace(/\n?```$/, "");
    } else if (updatedHtml.startsWith("```")) {
      updatedHtml = updatedHtml.replace(/^```\n?/, "");
      updatedHtml = updatedHtml.replace(/\n?```$/, "");
    }

    return res.json({ html: updatedHtml.trim() });
  } catch (error: any) {
    console.error("Gemini Selection Edit Error:", error);
    return res.status(500).json({ error: formatGeminiError(error) });
  }
});

// Convert HTML to Structured Semantic XML using Gemini AI fallbacks
router.post("/html-to-xml", validate([{ field: "htmlContent", type: "string", required: true, message: "Không tìm thấy nội dung HTML để chuyển đổi sang XML." }]), async (req: Request, res: Response) => {
  try {
    const { htmlContent } = req.body;

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Bạn là trợ lý AI chuyên gia cấu trúc dữ liệu và kỹ sư XML nghiệp vụ cấp cao.
Hãy chuyển đổi mã HTML sau đây thành một tài liệu XML ngữ nghĩa (Semantic XML) chuẩn mực và cực kỳ chuyên nghiệp.

Mã HTML đầu vào:
${htmlContent}

Yêu cầu cấu trúc XML:
1. XML phải có một thẻ root duy nhất tự đặt tên phản ánh đúng nội dung tài liệu hiển thị (ví dụ: <BaoCaoTaiChinh>, <HopDongKinhTe>, <TaiLieuHanhChinh>, <HoaDonBanHang>, <CongVanChuaChuong>, <DuaThaoDuPi>...).
2. Sử dụng các thẻ XML tự mô tả, ghi tên bằng tiếng Việt không dấu hoặc tiếng Anh dưới dạng camelCase hoặc snake_case cực kỳ rõ ràng, phản ánh chính xác ngữ nghĩa của dữ liệu bên trong (ví dụ: <ngayLap>, <benA>, <tongTien>, <noiDung>, <tableData>, <hangMuc>, <soLuong>, <donGia>...).
3. Tuyệt đối KHÔNG sử dụng các thẻ HTML hiển thị chung chung (như <div>, <span>, <p>, <table>, <tr>, <td>) trong XML đích. Phải chuyển đổi chúng thành các thẻ có ý nghĩa nghiệp vụ lớn (ví dụ: <DoanVan>, <TieuDe>, <BangSoLieu>, <HangDuLieu>, <OChiTiet> hoặc các thẻ nghiệp vụ đặc thù cho dữ liệu đó).
4. Đảm bảo cấu trúc tài liệu XML hoàn toàn hợp lệ (đóng mở thẻ đầy đủ, lồng nhau chuẩn xác, có khai báo XML prolog <?xml version="1.0" encoding="UTF-8"?> ở đầu dòng đầu tiên).
5. Trả về DUY NHẤT mã XML hoàn chỉnh, không bao gói thẻ markdown (\`\`\`xml) và không giải thích gì thêm.`,
            },
          ],
        },
      ],
      config: {
        temperature: 0.15,
      },
    });

    let xmlContent = response.text || "";

    // Cleanup markdown wrap
    if (xmlContent.trim().startsWith("```xml")) {
      xmlContent = xmlContent.replace(/^```xml\n?/, "");
      xmlContent = xmlContent.replace(/\n?```$/, "");
    } else if (xmlContent.trim().startsWith("```")) {
      xmlContent = xmlContent.replace(/^```\n?/, "");
      xmlContent = xmlContent.replace(/\n?```$/, "");
    }

    return res.json({ xml: xmlContent.trim() });
  } catch (error: any) {
    console.error("HTML to XML conversion error:", error);
    return res.status(500).json({ error: formatGeminiError(error) });
  }
});

// AI Semantic Search across document blocks
router.post("/semantic-search", validate([
  { field: "blocks", type: "array", required: true, min: 1, message: "Thiếu dữ liệu blocks để tìm kiếm." },
  { field: "query", type: "string", required: true, min: 1, message: "Thiếu từ khóa tìm kiếm." }
]), async (req: Request, res: Response) => {
  try {
    const { blocks, query } = req.body;

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an AI document semantic search engine.
We have a document composed of multiple blocks (each has an 'id' and 'content' or tableData).
User search query: "${query}"

Here are the document blocks in JSON format:
${JSON.stringify(blocks.map((b: any) => ({ id: b.id, type: b.type, content: b.content || "" })), null, 2)}

Identify which blocks are semantically relevant to the user query (matching synonyms, concepts, or intent, not just literal word matching).
For example, if query is "money issues", you should match blocks discussing "budget", "deficit", "pricing", "funding", etc.

Return a JSON array of the matching block IDs, ordered by relevance. Do not include markdown wraps or explanations. Only return the raw JSON array of strings (e.g., ["block-1", "block-3"]).`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: "Return ONLY a JSON array of strings representing matching block IDs. No explanation.",
        temperature: 0.1,
      },
    });

    let text = response.text || "[]";
    if (text.trim().startsWith("```json")) {
      text = text.replace(/^```json\n?/, "");
      text = text.replace(/\n?```$/, "");
    } else if (text.trim().startsWith("```")) {
      text = text.replace(/^```\n?/, "");
      text = text.replace(/\n?```$/, "");
    }

    try {
      const matchedIds = JSON.parse(text.trim());
      return res.json({ matchedIds });
    } catch {
      // Fallback: parse array manually or return empty
      return res.json({ matchedIds: [] });
    }
  } catch (error: any) {
    console.error("Semantic search error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// AI Excel Formula Generator
router.post("/generate-formula", validate([
  { field: "tableData", type: "array", required: true, min: 1, message: "Thiếu dữ liệu bảng để tạo công thức." },
  { field: "instruction", type: "string", required: true, min: 1, message: "Thiếu yêu cầu công thức." }
]), async (req: Request, res: Response) => {
  try {
    const { tableData, instruction } = req.body;

    const textData = tableData.map((row: any) => row.map((c: any) => c.value).join(" | ")).join("\n");

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an expert Excel formula creator.
Analyze this Excel table structure (columns and typical rows):
${textData}

User request: "${instruction}"

Create a single standard Excel formula to accomplish this task.
Guidelines:
1. Supported formulas: SUM, AVERAGE, COUNT, MAX, MIN, CONCAT, UPPER, LOWER, PRODUCT.
2. The formula must start with '=' (e.g. "=SUM(B2:B5)").
3. Reference correct columns (A, B, C, etc.) and row numbers (headers are row 1, data starts at row 2).
4. Return ONLY the raw Excel formula. Do NOT wrap in markdown or explain.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: "Return ONLY the raw Excel formula string starting with '=', no markdown tags or explanations.",
        temperature: 0.1,
      },
    });

    const formula = (response.text || "").trim();
    return res.json({ formula });
  } catch (error: any) {
    console.error("Formula generator error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// AI PowerPoint Slide Theme & Content Designer
router.post("/refine-slide", validate([
  { field: "slideBlock", type: "object", required: true, message: "Thiếu dữ liệu slide để thiết kế." },
  { field: "instruction", type: "string", required: true, min: 1, message: "Thiếu yêu cầu thiết kế slide." }
]), async (req: Request, res: Response) => {
  try {
    const { slideBlock, instruction } = req.body;

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a professional PowerPoint presentation designer.
Current Slide properties:
Title: "${slideBlock.content}"
Background: "${slideBlock.meta?.slideBg || "slate"}"
Layout: "${slideBlock.meta?.layout || "bullets"}"
Bullet Points: ${JSON.stringify(slideBlock.meta?.bulletPoints || [])}

User design request: "${instruction}"

Redesign this slide based on the user's request. Adjust the background, layout, title, or bullet points accordingly.
Allowed backgrounds: "slate", "indigo", "purple", "emerald", "rose"
Allowed layouts: "title", "bullets", "two-columns", "quote"

Return the redesigned slide properties as a JSON object with this exact schema (no markdown, no explanations):
{
  "content": "Updated slide title",
  "meta": {
    "slideBg": "slate" | "indigo" | "purple" | "emerald" | "rose",
    "layout": "title" | "bullets" | "two-columns" | "quote",
    "bulletPoints": ["point 1", "point 2", ...]
  }
}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const responseText = response.text || "{}";
    const result = JSON.parse(responseText.trim());
    return res.json(result);
  } catch (error: any) {
    console.error("Refine slide error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// AI Image Region editing analyzer
router.post("/edit-image-region", validate([
  { field: "imageBase64", type: "string", required: true, message: "Thiếu dữ liệu ảnh vùng chọn." },
  { field: "prompt", type: "string", required: true, min: 1, message: "Thiếu yêu cầu chỉnh sửa ảnh." }
]), async (req: Request, res: Response) => {
  try {
    const { imageBase64, prompt } = req.body;
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const systemInstruction = `You are an expert document image editor assistant.
Analyze the provided cropped image from a document page and the user's editing prompt.
Your task is to identify if the request is a text editing/replacement task.
If it is a text replacement/edit, detect:
1. The background/clear color (HEX format) to paint over the old text.
2. The new text content requested by the user.
3. The text color (HEX format).
4. The estimated font size (in pixels, relative to the cropped image height which is typically 50px to 200px).
5. The font family ("sans-serif", "serif", "monospace").
6. The font weight ("normal" or "bold").
7. The relative x and y coordinates (0 to 100 percent) where the text should be drawn.
8. The relative width (w) and height (h) (0 to 100 percent) representing the bounding box of the text to clear.

Return ONLY a JSON object matching this schema:
{
  "type": "text_edit",
  "clearColor": "#FFFFFF",
  "textColor": "#000000",
  "fontSize": 16,
  "fontFamily": "sans-serif",
  "fontWeight": "normal",
  "text": "New Text",
  "x": 10,
  "y": 50,
  "w": 80,
  "h": 30
}

If it is not a text replacement (e.g. user asks to insert a logo or draw a shape), return:
{
  "type": "general_edit",
  "prompt": "Description of the visual modification needed"
}

Do not include markdown tags or explanations. Return ONLY the JSON object.`;

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            { text: `User Prompt: "${prompt}"` },
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/jpeg",
              },
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const responseText = (response.text || "{}").trim();
    
    // Clean markdown wraps if any
    let cleanedText = responseText;
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.replace(/^```json\n?/, "");
      cleanedText = cleanedText.replace(/\n?```$/, "");
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```\n?/, "");
      cleanedText = cleanedText.replace(/\n?```$/, "");
    }

    const editInstruction = JSON.parse(cleanedText);
    return res.json(editInstruction);
  } catch (error: any) {
    console.error("Edit image region error:", error);
    return res.status(500).json({ error: formatGeminiError(error) });
  }
});

export default router;
