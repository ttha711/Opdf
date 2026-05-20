import type { EditorBlock, LivePatch } from "./types";

type AiPatchRequest = {
  prompt: string;
  selectedBlocks: EditorBlock[];
  allBlocks: EditorBlock[];
  referenceImage: string | null;
};

const isPatch = (value: unknown): value is LivePatch => {
  if (!value || typeof value !== "object") return false;
  const updates = (value as { updates?: unknown }).updates;
  if (!Array.isArray(updates)) return false;
  return updates.every((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string");
};

const tryBuildPatchFromLoosePayload = (payload: unknown, request: AiPatchRequest): LivePatch | null => {
  const selected = request.selectedBlocks.length > 0 ? request.selectedBlocks : request.allBlocks.slice(0, 1);
  const first = selected[0];
  if (!first) return null;

  const pickText = (obj: Record<string, unknown>): string | null => {
    const candidates = ["html", "content", "answer", "output", "message", "text"];
    for (const key of candidates) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };

  if (typeof payload === "string" && payload.trim()) {
    return { updates: [{ id: first.id, html: `<p>${payload.trim()}</p>`, content: payload.trim() }] };
  }
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  const direct = pickText(root);
  if (direct) return { updates: [{ id: first.id, html: direct.includes("<") ? direct : `<p>${direct}</p>`, content: direct }] };

  const data = root.data;
  if (data && typeof data === "object") {
    const fromData = pickText(data as Record<string, unknown>);
    if (fromData) return { updates: [{ id: first.id, html: fromData.includes("<") ? fromData : `<p>${fromData}</p>`, content: fromData }] };
  }

  return null;
};

const fallbackPatch = (request: AiPatchRequest): LivePatch => {
  const { prompt, selectedBlocks, allBlocks } = request;
  const targets = selectedBlocks.length > 0 ? selectedBlocks : allBlocks;
  const wantsHeading = /heading|tiêu đề/i.test(prompt);
  const wantsBullets = /bullet|danh sách|list/i.test(prompt);
  const wantsNoto = /noto\s*sans/i.test(prompt);
  return {
    updates: targets.map((b) => {
      let html = b.html;
      let type = b.type;
      const style = { ...b.style };
      if (wantsHeading && b.type !== "heading") {
        type = "heading";
        html = `<h3>${b.content}</h3>`;
        style.size = 16;
      }
      if (wantsBullets && b.type !== "list") {
        const items = b.content.split(/[.;]\s+/).filter(Boolean).map((item) => `<li>${item.trim()}</li>`).join("");
        if (items) {
          type = "list";
          html = `<ul>${items}</ul>`;
        }
      }
      if (wantsNoto) style.font = "Noto Sans";
      return { id: b.id, type, html, style };
    }),
  };
};

export async function generateAiPatch(request: AiPatchRequest): Promise<LivePatch> {
  if (window.opdf?.applyAiPatch) {
    const payload = await window.opdf.applyAiPatch(request);
    if (!isPatch(payload)) {
      const loose = tryBuildPatchFromLoosePayload(payload, request);
      if (loose) return loose;
      throw new Error("Desktop AI patch response is invalid.");
    }
    return payload;
  }

  const endpoint = localStorage.getItem("opdf-live-editor-ai-endpoint");
  if (!endpoint) return fallbackPatch(request);
  const apiKey = localStorage.getItem("opdf-live-editor-ai-key");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ ...request, output: "json_patch" }),
  });
  if (!res.ok) throw new Error(`AI endpoint failed: ${res.status}`);
  const payload: unknown = await res.json();
  if (!isPatch(payload)) {
    const loose = tryBuildPatchFromLoosePayload(payload, request);
    if (loose) return loose;
    throw new Error("AI patch response is invalid.");
  }
  return payload;
}
