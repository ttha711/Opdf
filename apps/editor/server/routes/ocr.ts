import { Router, Request, Response } from "express";
import { generateContentWithFallback, formatGeminiError } from "../gemini";
import { tidyHtml } from "../htmlUtils";
import { validate } from "../middleware/validate";

const router = Router();

router.post("/convert-page", validate([{ field: "imageBase64", type: "string", required: true, message: "Thiếu dữ liệu ảnh để OCR." }]), async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;

    // Remove the prefix "data:image/jpeg;base64," if it exists
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const response = await generateContentWithFallback({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an expert web developer and OCR system. 
Convert the provided image of a document page into clean, semantic HTML. 
Preserve the layout, structure, headings, paragraphs, lists, and tables as closely as possible. 
Use semantic HTML tags (<h1>, <p>, <ul>, <table>, etc.) and basic inline styles (e.g., text-align, padding, font-weight) for alignment or layout if necessary to mimic the original document. 

CRITICAL INSTRUCTIONS FOR SPECIAL ELEMENTS:
- Tables: Convert them accurately into HTML <table>, <tr>, <th>, and <td> elements. Apply inline CSS appropriately to mimic the original visual styles, such as borders (e.g. style="border: 1px solid #ccc;"), alignment, background colors, or column widths matching the original layout.
- Images, Photos, and Charts: You cannot output raw image files. Instead, you MUST create a unique placeholder div that the client will use to extract and crop the image from the original page image!
Use this EXACT format for ANY images, photos, or charts:
<div class="crop-image-placeholder" data-x="[left%]" data-y="[top%]" data-w="[width%]" data-h="[height%]" aria-label="[description]"></div>
where data-x, data-y, data-w, and data-h are numerical percentage values (0 to 100) representing the bounding box of the image on the original document page. 
For example, if an image covers the left half of the page from the top, it would be: data-x="0" data-y="0" data-w="50" data-h="50".

Return ONLY the raw HTML content, without wrapping it in a markdown code block (\`\`\`html). Do not include <html>, <head>, or <body> tags, just the inner content.`,
            },
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
        temperature: 0.2,
      },
    });

    let htmlContent = response.text || "";

    // Attempt to clean up accidental markdown wrap
    if (htmlContent.startsWith("```html")) {
      htmlContent = htmlContent.replace(/^```html\n?/, "");
      htmlContent = htmlContent.replace(/\n?```$/, "");
    }

    const finalHtmlClean = tidyHtml(htmlContent.trim());
    return res.json({ html: finalHtmlClean });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ error: formatGeminiError(error) });
  }
});

export default router;
