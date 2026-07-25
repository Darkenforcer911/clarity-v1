const REDIRECT_BASE_URL = "https://clarity.local";

export function getSafeRedirectPath(
  candidate: string | null | undefined,
  fallback = "/today",
) {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const url = new URL(candidate, REDIRECT_BASE_URL);

    if (url.origin !== REDIRECT_BASE_URL) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
