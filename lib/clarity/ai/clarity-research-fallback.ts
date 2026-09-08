const RESEARCH_UNAVAILABLE_DISCLOSURE =
  "I couldn’t verify the current information just now, so I’m not treating that part as settled.";

export function buildClarityResearchFallback(response: string) {
  const usefulResponse = response.trim();
  return usefulResponse
    ? `${usefulResponse}\n\n${RESEARCH_UNAVAILABLE_DISCLOSURE}`
    : RESEARCH_UNAVAILABLE_DISCLOSURE;
}

export class ClarityResearchFallbackError extends Error {
  readonly fallbackResponse: string;

  constructor(fallbackResponse: string) {
    super("Current research could not be completed.");
    this.name = "ClarityResearchFallbackError";
    this.fallbackResponse = fallbackResponse;
  }
}
