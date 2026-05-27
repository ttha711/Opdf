/**
 * Helper to balance/auto-close unclosed/broken HTML tags from truncated LLM outputs.
 */
export function tidyHtml(html: string): string {
  const tagRegex = /<\/?([a-zA-Z1-6]+)(?:[\s>][^>]*)?>/g;
  const selfClosingTags = new Set(["img", "br", "hr", "input", "meta", "link", "source", "embed"]);
  const stack: string[] = [];
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();

    if (selfClosingTags.has(tagName) || fullTag.endsWith("/>")) {
      continue;
    }

    if (fullTag.startsWith("</")) {
      if (stack.length > 0) {
        const lastTag = stack[stack.length - 1];
        if (lastTag === tagName) {
          stack.pop();
        } else {
          const index = stack.lastIndexOf(tagName);
          if (index !== -1) {
            stack.splice(index);
          }
        }
      }
    } else {
      stack.push(tagName);
    }
  }

  let closedHtml = html;
  while (stack.length > 0) {
    const missingTag = stack.pop();
    closedHtml += `</${missingTag}>`;
  }
  return closedHtml;
}
