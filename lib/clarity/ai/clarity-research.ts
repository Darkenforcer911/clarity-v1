import { z } from "zod";

const MAX_RESEARCH_SOURCES = 8;

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
  const candidates: ResearchSourceCandidate[] = [];
  let toolCallCount = 0;

  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") {
      toolCallCount += 1;
      if (Array.isArray(item.action?.sources)) {
        candidates.push(...item.action.sources);
      }
    }

    for (const content of item.content ?? []) {
      if (!Array.isArray(content.annotations)) continue;
      for (const annotation of content.annotations) {
        if (
          isRecord(annotation) &&
          annotation.type === "url_citation"
        ) {
          candidates.push(annotation);
        }
      }
    }
  }

  const sources = dedupeSources(
    candidates
      .map((candidate) => normalizeSource(candidate, input.retrievedAt))
      .filter((source): source is ClarityResearchSource => source !== null),
  ).slice(0, MAX_RESEARCH_SOURCES);

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
    .max(MAX_RESEARCH_SOURCES)
    .safeParse(metadata.research.sources);
  return result.success ? result.data : [];
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

function dedupeSources(sources: ClarityResearchSource[]) {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  return sources.filter((source) => {
    const titleKey = `${source.domain.toLowerCase()}:${source.title.trim().toLowerCase()}`;
    if (seenUrls.has(source.url) || seenTitles.has(titleKey)) return false;
    seenUrls.add(source.url);
    seenTitles.add(titleKey);
    return true;
  });
}

function normalizeSourceUrl(url: URL) {
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
