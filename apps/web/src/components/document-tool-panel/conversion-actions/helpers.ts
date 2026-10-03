export const extractPageLines = (textContent: any): string[] => {
  const rawItems = Array.isArray(textContent?.items) ? textContent.items : [];
  const positioned = rawItems
    .map((item: any) => {
      const text = typeof item?.str === "string" ? item.str.trim() : "";
      if (!text) return null;
      const t = Array.isArray(item?.transform) ? item.transform : null;
      const x = t && typeof t[4] === "number" ? t[4] : 0;
      const y = t && typeof t[5] === "number" ? t[5] : 0;
      return { text, x, y };
    })
    .filter(Boolean) as Array<{ text: string; x: number; y: number }>;

  if (positioned.length === 0) return [];
  positioned.sort((a, b) => (Math.abs(b.y - a.y) > 0.5 ? b.y - a.y : a.x - b.x));

  const rows: Array<{ y: number; items: Array<{ text: string; x: number }> }> = [];
  const yTolerance = 2.5;
  for (const item of positioned) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= yTolerance);
    if (row) {
      row.items.push({ text: item.text, x: item.x });
    } else {
      rows.push({ y: item.y, items: [{ text: item.text, x: item.x }] });
    }
  }

  const lines = rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.items.sort((a, b) => a.x - b.x).map((i) => i.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines;
};

export const downloadFile = async (
  data: Uint8Array | string,
  defaultName: string,
  extensions: string[]
): Promise<void> => {
  const rawBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const bytes = new Uint8Array(rawBytes.byteLength);
  bytes.set(rawBytes);
  if ((window as any).opdf && typeof (window as any).opdf.saveFile === "function") {
    try {
      await (window as any).opdf.saveFile(bytes, defaultName, extensions);
      return;
    } catch (err) {
      console.error("Native save failed, falling back to browser download:", err);
    }
  }

  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 20000);
};

export const convertBlobToImage = async (
  blob: Blob,
  isPng: boolean,
  scale = 1,
  grayscale = false,
): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    const finish = (result: Blob) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        finish(blob);
        return;
      }
      if (grayscale) ctx.filter = "grayscale(100%)";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((result) => finish(result || blob), isPng ? "image/png" : "image/jpeg");
    };
    img.onerror = () => finish(blob);
    img.src = url;
  });
};

export const convertBlobToGrayscale = async (blob: Blob, isPng: boolean): Promise<Blob> =>
  convertBlobToImage(blob, isPng, 1, true);
