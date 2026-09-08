import { z } from "zod";

const MAX_STORED_RESEARCH_SOURCES = 8;
const DEFAULT_RESEARCH_SOURCE_LIMIT = 4;
const EXTENDED_RESEARCH_SOURCE_LIMIT = 6;

export const clarityResearchSourceSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: z
      .url()
      .refine((value) => value.startsWith("https://") || value.startsWith("http://")),
    domain: z.string().trim().min(1).max(253),
    publishedAt: z.iso.datetime().nullable(),
    retrievedAt: z.iso.datetime(),
  })
  .strict();

export type ClarityResearchSource = z.infer<typeof clarityResearchSourceSchema>;

export type ClarityResearchMetadata = {
  used: true;
  sources: ClarityResearchSource[];
  sourceCount: number;
  toolCallCount: number;
  latencyMs: number;
};

type ResearchSourceCandidate = {
  url?: unknown;
  title?: unknown;
  published_at?: unknown;
  publication_date?: unknown;
};

type RankedResearchSource = {
  source: ClarityResearchSource;
  cited: boolean;
  ordinal: number;
};

type ResearchResponse = {
  output?: Array<{
    type?: unknown;
    action?: { sources?: unknown };
    content?: Array<{
      annotations?: unknown;
    }>;
  }>;
};

export function extractClarityResearchMetadata(
  response: ResearchResponse,
  input: { retrievedAt: string; latencyMs: number },
): ClarityResearchMetadata {
  const candidates: Array<{
    candidate: ResearchSourceCandidate;
    cited: boolean;
  }> = [];
  let toolCallCount = 0;

  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") {
      toolCallCount += 1;
      if (Array.isArray(item.action?.sources)) {
        candidates.push(
          ...item.action.sources.map((candidate) => ({
            candidate: candidate as ResearchSourceCandidate,
            cited: false,
          })),
        );
      }
    }

    for (const content of item.content ?? []) {
      if (!Array.isArray(content.annotations)) continue;
      for (const annotation of content.annotations) {
        if (
          isRecord(annotation) &&
          annotation.type === "url_citation"
        ) {
          candidates.push({ candidate: annotation, cited: true });
        }
      }
    }
  }

  const sources = selectRankedSources(
    candidates
      .map(({ candidate, cited }, ordinal) => {
        const source = normalizeSource(candidate, input.retrievedAt);
        return source ? { source, cited, ordinal } : null;
      })
      .filter((source): source is RankedResearchSource => source !== null),
  );

  return {
    used: true,
    sources,
    sourceCount: sources.length,
    toolCallCount,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
  };
}

export function researchSourcesFromMetadata(
  metadata: unknown,
): ClarityResearchSource[] {
  if (!isRecord(metadata) || !isRecord(metadata.research)) return [];
  const result = z
    .array(clarityResearchSourceSchema)
    .max(MAX_STORED_RESEARCH_SOURCES)
    .safeParse(metadata.research.sources);
  return result.success ? selectClarityResearchSources(result.data) : [];
}

export function selectClarityResearchSources(
  sources: ClarityResearchSource[],
  allowDistinctSamePublisher = false,
) {
  return selectRankedSources(
    sources.map((source, ordinal) => ({
      source,
      cited: allowDistinctSamePublisher,
      ordinal,
    })),
  );
}

export function researchPublisherLabel(source: ClarityResearchSource) {
  const domain = source.domain.toLowerCase().replace(/^www\./, "");
  const exact: Record<string, string> = {
    "apnews.com": "AP News",
    "reuters.com": "Reuters",
    "bbc.com": "BBC",
    "bbc.co.uk": "BBC",
    "rba.gov.au": "Reserve Bank of Australia",
    "abs.gov.au": "Australian Bureau of Statistics",
  };
  return exact[domain] ?? domain;
}

export function researchCountryCode(country: string | null) {
  const normalized = country?.trim().toLowerCase() ?? "";
  if (/^[a-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  if (normalized === "usa" || normalized === "united states of america") return "US";
  if (normalized === "uk") return "GB";
  if (!normalized || typeof Intl.DisplayNames !== "function") return null;

  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      if (displayNames.of(code)?.toLowerCase() === normalized) return code;
    }
  }
  return null;
}

function normalizeSource(
  candidate: ResearchSourceCandidate,
  retrievedAt: string,
): ClarityResearchSource | null {
  if (typeof candidate.url !== "string") return null;

  try {
    const url = new URL(candidate.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    normalizeSourceUrl(url);
    const domain = url.hostname.replace(/^www\./, "");
    const title = typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim().slice(0, 300)
      : domain;
    const publishedAt = normalizePublishedAt(
      candidate.published_at ?? candidate.publication_date,
    );
    const parsed = clarityResearchSourceSchema.safeParse({
      title,
      url: url.toString(),
      domain,
      publishedAt,
      retrievedAt,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function normalizePublishedAt(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function selectRankedSources(candidates: RankedResearchSource[]) {
  const deduped = dedupeRankedSources(candidates).sort((left, right) =>
    Number(right.cited) - Number(left.cited) ||
    authorityScore(right.source.domain) - authorityScore(left.source.domain) ||
    left.ordinal - right.ordinal,
  );
  const cited = deduped.filter((candidate) => candidate.cited);
  const eligible = cited.length >= 2 ? cited : deduped;
  const selected: RankedResearchSource[] = [];
  const domainCounts = new Map<string, number>();

  for (const candidate of eligible) {
    const domain = candidate.source.domain;
    if (domainCounts.has(domain)) continue;
    selected.push(candidate);
    domainCounts.set(domain, 1);
    if (selected.length === DEFAULT_RESEARCH_SOURCE_LIMIT) break;
  }

  // A second article from the same publisher is useful only when the final
  // answer actually cited it. This prevents search-result floods while still
  // allowing genuinely distinct supporting evidence.
  for (const candidate of eligible) {
    if (!candidate.cited || selected.includes(candidate)) continue;
    const count = domainCounts.get(candidate.source.domain) ?? 0;
    if (count >= 2) continue;
    selected.push(candidate);
    domainCounts.set(candidate.source.domain, count + 1);
    if (selected.length === EXTENDED_RESEARCH_SOURCE_LIMIT) break;
  }

  return selected.map(({ source }) => source);
}

function dedupeRankedSources(candidates: RankedResearchSource[]) {
  const byUrl = new Map<string, RankedResearchSource>();
  const byArticle = new Map<string, RankedResearchSource>();

  for (const candidate of candidates) {
    const urlKey = canonicalSourceKey(candidate.source.url);
    const articleKey = `${candidate.source.domain}:${normalizedArticleTitle(candidate.source.title)}`;
    const previous = byUrl.get(urlKey) ?? byArticle.get(articleKey);
    if (previous) {
      previous.cited ||= candidate.cited;
      continue;
    }
    byUrl.set(urlKey, candidate);
    byArticle.set(articleKey, candidate);
  }
  return [...byUrl.values()];
}

function normalizeSourceUrl(url: URL) {
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      [
        "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid",
        "ref", "referrer", "source", "campaign", "cmpid", "igshid",
      ].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/(?:amp|amp\/?)$/i, "");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
}

function canonicalSourceKey(value: string) {
  const url = new URL(value);
  normalizeSourceUrl(url);
  return `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
}

function normalizedArticleTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+[|–—-]\s+[^|–—-]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function authorityScore(domain: string) {
  if (/\.gov(?:\.[a-z]{2})?$/.test(domain) || domain.endsWith(".gov.au")) return 3;
  if (/\.edu(?:\.[a-z]{2})?$/.test(domain)) return 2;
  if (["reuters.com", "apnews.com", "bbc.com", "bbc.co.uk"].includes(domain)) return 2;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
