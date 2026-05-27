import { Router, Request, Response } from "express";
import { generateContentWithFallback, formatGeminiError } from "../gemini";
import { validate } from "../middleware/validate";
import { validateAndParseAIResponse } from "../middleware/aiValidator";

const router = Router();

// AI-Assisted Document Generator (creates structured JSON schemas)
router.post("/generate-document", validate([{ field: "prompt", type: "string", required: true, min: 1, max: 5000, message: "Phải nhập yêu cầu để tạo tài liệu." }]), async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Hãy đóng vai trò là một chuyên gia soạn thảo tài liệu, quản trị viên Excel và thiết kế Slide chuyên nghiệp. 
Tạo cấu trúc tài liệu thông minh dưới dạng JSON (Structured Document Schema) dựa trên yêu cầu: "${prompt}".
Tài liệu cần tích hợp đầy đủ cả 3 khía cạnh: Văn bản hành chính (Word), Bảng tính số liệu kèm công thức tính toán và biểu đồ (Excel), và Các trang trình bày trực quan (PowerPoint slide).

Phản hồi của bạn PHẢI tuân thủ nghiêm ngặt định dạng JSON sau:
{
  "title": "Tiêu đề tài liệu",
  "description": "Mô tả ngắn gọn về nội dung",
  "theme": "corporate" | "minimalist" | "warm" | "modern",
  "blocks": [
    {
      "id": "chuỗi_id_ngẫu_nhiên_ngắn (ví dụ b1, b2...)",
      "type": "heading" | "paragraph" | "table" | "chart" | "callout" | "slide" | "page-break",
      "content": "Nội dung văn bản chính (cho heading, paragraph, callout, slide)",
      "meta": {
        "level": 1 | 2 | 3,  // Chỉ dành cho heading
        "style": "",  // Tuỳ chọn
        "chartType": "bar" | "line" | "pie",  // Chỉ dành cho type: "chart"
        "chartDataKeys": ["Tên_Trục_X", "Tên_Trục_Y1", "Tên_Trục_Y2_Nếu_Có"], // Cho biểu đồ, liên kết với dữ liệu của bảng gần nhất
        "calloutType": "info" | "warning" | "success" | "danger", // Cho callout
        "bulletPoints": ["Gạch đầu dòng 1", "Gạch đầu dòng 2"] // Cho paragraph danh sách hoặc slide bullet
      },
      "tableData": [
        // Grid ô hai chiều đại diện Excel: [Hàng][Cột]. Mỗi ô có:
        [
          { "value": "Tên cột hoặc giá trị thường", "formula": "Nếu là công thức, bắt đầu bằng dấu '=' ví dụ =SUM(B2:B5) hoặc =PRODUCT(B2:C2) hay =AVERAGE(B2:B4)" }
        ]
      ]
    }
  ]
}

BẮT BUỘC THIẾT KẾ CẢ 3 PHÂN HỆ TRONG DANH SÁCH BLOCKS:
1. Có ít nhất 3-4 blocks heading và paragraph (và callout) để làm phần văn kiện (Document).
2. Có ít nhất 1 block "table" đại diện cho Excel với công thức thực tế (ví dụ: cột Số lượng, Đơn giá, Thành tiền... hàng cuối có ô Tổng cộng chứa công thức như '=SUM(D2:D5)'). Tạo ít nhất 4-5 hàng dữ liệu thực tế mang tính chuyên môn cao (như đơn giá xây dựng, phí tư vấn phần mềm, dự thảo tài chính).
3. Có ít nhất 1 block "chart" liên kết với dữ liệu bảng đó để vẽ biểu đồ trực quan từ bảng dữ liệu.
4. Có ít nhất 3-4 blocks "slide" đại diện cho PPTX, mỗi slide có tiêu đề content thú vị và đống bulletPoints minh hoạ hành trình dự án, cột mốc hoặc mô tả báo giá.
5. Có phân trang xen kẽ bằng block "page-break" tạo điểm nghỉ ngắt trang chuẩn A4.

Trả về DUY NHẤT một chuỗi JSON thuần tuý, không chứa ký từ bọc markdown (\`\`\`json ... \`\`\`), không giải thích gì thêm.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    const responseText = response.text || "{}";
    const validation = validateAndParseAIResponse(responseText);
    if (validation.success) {
      return res.json(validation.data);
    }
    console.warn("[generate-document] Schema validation warning:", (validation as { success: false; error: string }).error);
    try {
      const parsedData = JSON.parse(responseText.trim());
      return res.json(parsedData);
    } catch {
      return res.status(500).json({ error: "AI trả về dữ liệu không hợp lệ. Vui lòng thử lại.", code: "AI_VALIDATION_FAILED" });
    }
  } catch (error: any) {
    console.error("Generate Document API Error:", error);
    return res.status(500).json({ error: formatGeminiError(error) });
  }
});

// AI-Assisted Document Schema Refinement
router.post("/refine-document", validate([
  { field: "documentSchema", type: "object", required: true, message: "Không tìm thấy cấu trúc tài liệu hiện tại." },
  { field: "instruction", type: "string", required: true, min: 1, message: "Chưa nhập chỉ thị tinh chỉnh của bạn." }
]), async (req: Request, res: Response) => {
  try {
    const { documentSchema, instruction } = req.body;

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Bạn là trợ lý AI chỉnh sửa tài liệu tối cao. 
Nhiệm vụ của bạn là đọc cấu trúc tài liệu JSON hiện tại, sau đó tinh chỉnh, bổ sung, sửa đổi hoặc định dạng lại nó theo đúng chỉ thị mong muốn của người dùng.

Chỉ thị tinh chỉnh: "${instruction}"

Dưới đây là cấu trúc tài liệu JSON hiện tại của họ:
${JSON.stringify(documentSchema, null, 2)}

Hãy phản hồi lại bằng cấu trúc JSON đã được cập nhật hoàn chỉnh tương ứng với cấu trúc ban đầu.
Lưu ý quan trọng:
1. Đảm bảo giữ cấu trúc danh sách các blocks đầy đủ, sửa đổi nội dung text, thêm bớt hàng trong bảng, sửa đổi hoặc thêm bớt công thức tính toán Excel, hay viết thêm tiêu đề/bullets cho Slide theo đúng yêu cầu.
2. Nếu người dùng yêu cầu tính thêm thuế, chiết khẩu, đổi ngoại tệ, thêm báo giá... hãy bổ sung trực tiếp các ô hàng trong tableData và cập nhật công thức tính (ví dụ SUM, PRODUCT) tương ứng cực kỳ chính xác.
3. Chỉ được phép trả về chuỗi JSON đạt tiêu chuẩn cú pháp, tuyệt đối không có giải thích hay thẻ code markdown (\`\`\`json).`,
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
    const validation = validateAndParseAIResponse(responseText);
    if (validation.success) {
      return res.json(validation.data);
    }
    console.warn("[refine-document] Schema validation warning:", (validation as { success: false; error: string }).error);
    try {
      const parsedData = JSON.parse(responseText.trim());
      return res.json(parsedData);
    } catch {
      return res.status(500).json({ error: "AI trả về dữ liệu không hợp lệ. Vui lòng thử lại.", code: "AI_VALIDATION_FAILED" });
    }
  } catch (error: any) {
    console.error("Refine Document API Error:", error);
    return res.status(500).json({ error: formatGeminiError(error) });
  }
});

export default router;
