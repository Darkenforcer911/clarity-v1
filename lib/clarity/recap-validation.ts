export function progressExplanationError(value: string) {
  const normalized = value.trim();
  const meaningfulWords =
    normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]+/gu) ?? [];
  const nonWhitespaceLength = normalized.replace(/\s/g, "").length;

  if (
    meaningfulWords.length < 2 ||
    nonWhitespaceLength < 8
  ) {
    return "Use at least two meaningful words and eight characters.";
  }

  return null;
}
