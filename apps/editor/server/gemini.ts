import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini API (if key is available)
export const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

export interface GeminiParams {
  contents: any;
  config?: any;
}

const MODEL_TIMEOUT_MS = Number(process.env.AI_MODEL_TIMEOUT_MS || 60000);

function timeoutError(provider: string, timeoutMs: number) {
  return new Error(`${provider} request timed out after ${Math.round(timeoutMs / 1000)}s`);
}

async function withTimeout<T>(promise: Promise<T>, provider: string, timeoutMs = MODEL_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(provider, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Helper to convert Gemini payload structure to OpenAI/Qwen Chat Completions structure
 */
function convertToQwenMessages(contents: any, systemInstruction?: string) {
  const messages: any[] = [];

  // Add system instruction if present
  if (systemInstruction) {
    messages.push({
      role: "system",
      content: systemInstruction,
    });
  }

  if (!Array.isArray(contents)) {
    if (typeof contents === "string") {
      messages.push({ role: "user", content: contents });
    }
    return messages;
  }

  for (const turn of contents) {
    const role = turn.role === "model" ? "assistant" : "user";
    const parts = turn.parts;

    if (typeof parts === "string") {
      messages.push({ role, content: parts });
    } else if (Array.isArray(parts)) {
      const contentList: any[] = [];
      let textContent = "";

      for (const part of parts) {
        if (typeof part === "string") {
          textContent += part;
        } else if (part.text) {
          textContent += part.text;
        } else if (part.inlineData) {
          const mimeType = part.inlineData.mimeType;
          const data = part.inlineData.data;
          
          if (mimeType.startsWith("image/")) {
            contentList.push({
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${data}`,
              },
            });
          } else if (mimeType === "application/pdf") {
            // PDF fallback message for Qwen which doesn't support direct PDF base64
            textContent += `\n[Lưu ý: Tệp PDF đính kèm. Nội dung PDF đã được trích xuất bằng bộ parser vật lý của hệ thống.]\n`;
          }
        }
      }

      if (textContent) {
        if (contentList.length > 0) {
          contentList.unshift({ type: "text", text: textContent });
          messages.push({ role, content: contentList });
        } else {
          messages.push({ role, content: textContent });
        }
      } else if (contentList.length > 0) {
        messages.push({ role, content: contentList });
      }
    }
  }

  return messages;
}

/**
 * Handle API calls with progressive fallbacks to Qwen or Gemini.
 */
export async function generateContentWithFallback(params: GeminiParams): Promise<any> {
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const openrouterModel = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
  const qwenApiKey = process.env.QWEN_API_KEY;
  const qwenBaseUrl = process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

  // Check if we have image/multimodal content in the request
  let hasImage = false;
  if (Array.isArray(params.contents)) {
    for (const turn of params.contents) {
      if (Array.isArray(turn.parts)) {
        for (const part of turn.parts) {
          if (part.inlineData?.mimeType?.startsWith("image/")) {
            hasImage = true;
            break;
          }
        }
      }
    }
  }

  // 1. Try OpenRouter API if configured
  if (openrouterApiKey) {
    try {
      console.log(`[OpenRouter API] Invoking model: ${openrouterModel}`);
      const systemInstruction = params.config?.systemInstruction;
      const messages = convertToQwenMessages(params.contents, systemInstruction);
      const temperature = params.config?.temperature !== undefined ? params.config.temperature : 0.2;
      const isJson = params.config?.responseMimeType === "application/json";

      const requestBody: any = {
        model: openrouterModel,
        messages,
        temperature,
      };

      if (isJson) {
        requestBody.response_format = { type: "json_object" };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
      const response = await (async () => {
        try {
          return await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openrouterApiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://github.com/eddyvn98/pdf2html",
              "X-Title": "PDF to HTML AI Converter",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      })();

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (Status ${response.status}): ${errorText}`);
      }

      const responseData = await response.json();
      const content = responseData.choices?.[0]?.message?.content || "";

      return {
        text: content,
        candidates: [
          {
            content: {
              parts: [{ text: content }],
            },
          },
        ],
      };
    } catch (orErr) {
      console.warn("[OpenRouter API Error] Fallback to other providers:", orErr);
    }
  }

  // 2. Try Qwen API if configured (Recommended by user for test environment)
  if (qwenApiKey) {
    try {
      const modelName = hasImage ? "qwen-vl-plus" : "qwen-turbo";
      console.log(`[Qwen API] Invoking model: ${modelName}`);

      const systemInstruction = params.config?.systemInstruction;
      const messages = convertToQwenMessages(params.contents, systemInstruction);
      const temperature = params.config?.temperature !== undefined ? params.config.temperature : 0.2;
      const isJson = params.config?.responseMimeType === "application/json";

      const requestBody: any = {
        model: modelName,
        messages,
        temperature,
      };

      if (isJson) {
        requestBody.response_format = { type: "json_object" };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
      const response = await (async () => {
        try {
          return await fetch(`${qwenBaseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${qwenApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      })();

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qwen API error (Status ${response.status}): ${errorText}`);
      }

      const responseData = await response.json();
      const content = responseData.choices?.[0]?.message?.content || "";

      return {
        text: content,
        // Mock Gemini response structure if needed
        candidates: [
          {
            content: {
              parts: [{ text: content }],
            },
          },
        ],
      };
    } catch (qwenErr) {
      console.warn("[Qwen API Error] Fallback to Gemini if key is present:", qwenErr);
      if (!ai) {
        throw qwenErr;
      }
    }
  }

  // 2. Fallback to Gemini if Qwen is not configured or fails, and Gemini API key is available
  if (ai) {
    const models = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let lastError: any = null;

    for (const modelName of models) {
      try {
        console.log(`[Gemini API] Invoking model: ${modelName}`);
        const response = await withTimeout(
          ai.models.generateContent({
            ...params,
            model: modelName,
          }),
          `Gemini (${modelName})`
        );
        return response;
      } catch (err: any) {
        lastError = err;
        const errStr =
          String(err).toLowerCase() +
          " " +
          (err.message ? String(err.message).toLowerCase() : "") +
          " " +
          (err.status ? String(err.status).toLowerCase() : "");

        const isQuotaExceeded =
          errStr.includes("resource_exhausted") ||
          errStr.includes("429") ||
          errStr.includes("quota") ||
          errStr.includes("limit") ||
          errStr.includes("exceeded");

        if (isQuotaExceeded) {
          console.warn(
            `[Gemini API Fallback] Model ${modelName} hit quota limits. Trying next fallback option...`
          );
          continue;
        } else {
          throw err;
        }
      }
    }
    throw lastError;
  }

  throw new Error("Không tìm thấy cấu hình API Key cho Qwen hay Gemini.");
}

/**
 * Format error responses beautifully for Vietnamese users when hitting API limits.
 */
export function formatGeminiError(error: any): string {
  const errMsg = error.message || String(error);
  const errStr = errMsg.toLowerCase();

  const isQuota =
    errStr.includes("429") ||
    errStr.includes("quota exceeded") ||
    errStr.includes("resource_exhausted") ||
    errStr.includes("quota");

  if (isQuota) {
    let waitTime = "";
    const retryMatch =
      errMsg.match(/retry in\s+([0-9.]+s?)/i) || errMsg.match(/retryDelay\W+(\d+s?)/i);
    if (retryMatch) {
      waitTime = ` (Hãy thử lại sau khoảng ${retryMatch[1]})`;
    }

    return `⚠️ Hạn ngạch cuộc gọi AI miễn phí hàng ngày đã hết (API Quota Exceeded).\n\nVui lòng cấu hình API Key riêng trong file .env hoặc đợi một lát rồi thử lại${waitTime}.`;
  }

  return error.message || "Không thể xử lý yêu cầu bằng mô hình trí tuệ nhân tạo.";
}
