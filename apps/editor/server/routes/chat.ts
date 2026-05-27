import { Router, Request, Response } from "express";
import { generateContentWithFallback, formatGeminiError } from "../gemini";
import { validate } from "../middleware/validate";

const router = Router();

// API endpoint for AI-assisted Document Chat (Q&A)
router.post("/chat-doc", validate([{ field: "messages", type: "array", required: true, min: 1, message: "Thiếu lịch sử chat." }]), async (req: Request, res: Response) => {
  try {
    const { documentText, messages } = req.body;

    // Format messages history into Gemini/Qwen compatible structure
    const contents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const response = await generateContentWithFallback({
      contents,
      config: {
        systemInstruction: `You are an expert document assistant and business co-pilot integrated in Office Hub Pro editor.
Your task is to help the user review, summarize, analyze, or draft text based on their active working document text provided below.

ACTIVE WORKING DOCUMENT CONTENT:
"""
${documentText || "(Tài liệu trống hoặc chưa có nội dung chữ)"}
"""

Please be helpful, professional, and concise in your answers. Answer in Vietnamese unless asked otherwise. Refrain from modifying the document directly; only provide explanations, summaries, or suggestions.`,
        temperature: 0.3,
      },
    });

    const answer = response.text || "";
    return res.json({ answer: answer.trim() });
  } catch (error: any) {
    console.error("AI Document Chat Error:", error);
    return res.status(500).json({ error: formatGeminiError(error) });
  }
});

export default router;
