export function formatDetailsSummary(value: string) {
  const preview = value.trim().replace(/\s+/g, " ");
  return preview || "Not added";
}
