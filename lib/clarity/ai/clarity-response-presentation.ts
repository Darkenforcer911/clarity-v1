const RAW_URL = /<?https?:\/\/[^\s<>()[\]]+>?/gi;
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(https?:\/\/[^)\s]+\)/gi;
const SOURCE_DOMAIN_ANNOTATION = /\s*\(\s*(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\s*[,;]\s*(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,})*\s*\)/gi;

export function normalizeClarityVisibleResponse(
  value: string,
  structuredSources: readonly unknown[] = [],
) {
  return value
    .replace(MARKDOWN_LINK, "$1")
    .replace(RAW_URL, (match) => {
      if (match.startsWith("<") && match.endsWith(">")) return "";
      return match.match(/[.,;:!?]+$/)?.[0] ?? "";
    })
    .replace(structuredSources.length > 0 ? SOURCE_DOMAIN_ANNOTATION : /$^/, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
