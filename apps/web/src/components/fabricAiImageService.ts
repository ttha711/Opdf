import { extractGeneratedImageDataUrl } from "./fabricImageLayer.utils";

export type GenerateAiImageRequest = {
  prompt: string;
  selectedRegionImage: string | null;
  referenceImage: string | null;
};

function getLocalStorageValue(key: string): string {
  try {
    return localStorage.getItem(key)?.trim() || "";
  } catch {
    return "";
  }
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/chat-messages\/?$/i, "")
    .replace(/\/v1\/?$/i, "")
    .replace(/\/+$/, "");
}

function getConfiguredAiImageEndpoint(): string {
  const explicitEndpoint =
    getLocalStorageValue("opdf-image-ai-endpoint") ||
    import.meta.env.VITE_OPDF_IMAGE_AI_ENDPOINT ||
    "";
  if (explicitEndpoint) return explicitEndpoint;

  const configuredBase =
    getLocalStorageValue("opdf_dify_url") ||
    getLocalStorageValue("opdf_ai_gateway_url") ||
    import.meta.env.VITE_OPDF_AI_GATEWAY_URL ||
    import.meta.env.VITE_DIFY_API_URL ||
    "";
  if (!configuredBase) return "";
  return `${normalizeBaseUrl(configuredBase)}/ai/image`;
}

function getConfiguredAiImageKey(): string {
  return (
    getLocalStorageValue("opdf_dify_key") ||
    getLocalStorageValue("opdf-image-ai-key") ||
    import.meta.env.VITE_DIFY_API_KEY ||
    import.meta.env.VITE_OPDF_AI_GATEWAY_KEY ||
    ""
  );
}

async function generateViaEndpoint(request: GenerateAiImageRequest, endpoint: string): Promise<string> {
  const apiKey = getConfiguredAiImageKey();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      ...request,
      output: "image",
    }),
  });
  if (!res.ok) {
    throw new Error(`AI image endpoint failed: ${res.status}`);
  }
  const text = await res.text();
  const payload: unknown = tryParseJson(text) ?? text;
  const dataUrl = extractGeneratedImageDataUrl(payload);
  if (!dataUrl) {
    throw new Error("AI image endpoint response did not include image data.");
  }
  return dataUrl;
}

export async function generateAiImageDirect(request: GenerateAiImageRequest): Promise<string> {
  const endpoint = getConfiguredAiImageEndpoint();
  if (!endpoint) {
    throw new Error("AI image endpoint is not configured.");
  }
  return generateViaEndpoint(request, endpoint);
}

export async function generateAiImage(request: GenerateAiImageRequest): Promise<string> {
  const desktopGenerator = window.opdf?.generateAiImage;
  if (desktopGenerator) {
    const payload = await desktopGenerator(request);
    const dataUrl = extractGeneratedImageDataUrl(payload);
    if (dataUrl) return dataUrl;
    throw new Error("Desktop AI image response is invalid.");
  }

  return generateAiImageDirect(request);
}
