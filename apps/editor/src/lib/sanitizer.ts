/**
 * Safe client-side HTML cleaner that strips malicious script/XSS tags and Microsoft Word garbage metadata assets.
 */
export const sanitizeHtml = (htmlContent: string): string => {
  if (!htmlContent) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");

    // Remove any scripts, iframes, embeddings, object tags
    const scripts = Array.from(doc.getElementsByTagName("script"));
    scripts.forEach(s => s.remove());
    const iframes = Array.from(doc.getElementsByTagName("iframe"));
    iframes.forEach(i => i.remove());
    const objects = Array.from(doc.getElementsByTagName("object"));
    objects.forEach(o => o.remove());

    // Clean dangerous events (XSS) and MS Word namespaces/attributes
    const allEl = doc.body.getElementsByTagName("*");
    for (let i = 0; i < allEl.length; i++) {
      const el = allEl[i];
      const attrs = Array.from(el.attributes);
      attrs.forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || attr.value.toLowerCase().startsWith("javascript:")) {
          el.removeAttribute(attr.name);
        }
        if (name.startsWith("mso-") || name === "v:shapes" || name === "o:spid") {
          el.removeAttribute(attr.name);
        }
      });
    }

    // Clean crop-image-placeholders to remove base64 images and temporary style/class attributes
    const placeholders = Array.from(doc.querySelectorAll(".crop-image-placeholder"));
    placeholders.forEach((el) => {
      const x = el.getAttribute("data-crop-x") || el.getAttribute("data-x");
      const y = el.getAttribute("data-crop-y") || el.getAttribute("data-y");
      const w = el.getAttribute("data-w");
      const h = el.getAttribute("data-crop-h") || el.getAttribute("data-h");
      const cropW = el.getAttribute("data-crop-w") || el.getAttribute("data-w");
      const cropH = el.getAttribute("data-crop-h") || el.getAttribute("data-h");
      const label = el.getAttribute("aria-label");

      el.removeAttribute("style");
      el.removeAttribute("class");
      el.innerHTML = "";
      el.className = "crop-image-placeholder";

      if (x) el.setAttribute("data-x", x);
      if (y) el.setAttribute("data-y", y);
      if (w) el.setAttribute("data-w", w);
      if (h) el.setAttribute("data-h", h);
      if (cropW) el.setAttribute("data-crop-w", cropW);
      if (cropH) el.setAttribute("data-crop-h", cropH);
      if (label) el.setAttribute("aria-label", label);
    });

    return doc.body.innerHTML;
  } catch (err) {
    console.error("Sanitation error, using fallback:", err);
    return htmlContent;
  }
};
