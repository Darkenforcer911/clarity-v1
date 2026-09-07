const RAW_URL = /<?https?:\/\/[^\s<>()[\]]+>?/gi;
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(https?:\/\/[^)\s]+\)/gi;

export function normalizeClarityVisibleResponse(value: string) {
  return value
    .replace(MARKDOWN_LINK, "$1")
    .replace(RAW_URL, (match) => {
      if (match.startsWith("<") && match.endsWith(">")) return "";
      return match.match(/[.,;:!?]+$/)?.[0] ?? "";
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
