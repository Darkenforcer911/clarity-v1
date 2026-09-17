export const clarityMemoryKinds = [
  "raw_conversation",
  "recent_working_context",
  "episode",
  "canonical_life",
  "strategic_decision",
  "evidence_outcome",
  "compressed_summary",
] as const;

export type ClarityMemoryKind = (typeof clarityMemoryKinds)[number];

export type ClarityEpistemicStatus =
  | "user_reported"
  | "confirmed_canonical"
  | "system_observed"
  | "externally_verified";

export type ClarityConversationMessage = {
  id: string;
  role: "user" | "clarity";
  content: string;
  recordedAt: string;
};

/** One append-only, user-visible conversation for one authenticated user. */
export type ClarityConversationArchive = {
  conversationId: string;
  messages: ClarityConversationMessage[];
};

export type ClarityMemoryItem = {
  id: string;
  kind: Exclude<
    ClarityMemoryKind,
    "raw_conversation" | "recent_working_context" | "canonical_life"
  >;
  summary: string;
  epistemicStatus: ClarityEpistemicStatus;
  sourceReferences: string[];
  occurredAt: string | null;
  recordedAt: string;
};

export type ClarityConceptualMemoryContext = {
  recentConversation: ClarityConversationMessage[];
  recentWorkingContext: string[];
  episodes: ClarityMemoryItem[];
  strategicDecisions: ClarityMemoryItem[];
  evidenceAndOutcomes: ClarityMemoryItem[];
  compressedSummaries: ClarityMemoryItem[];
};

export type ClarityMemoryQuery = {
  query: string;
  kinds: ClarityMemoryKind[];
  limit: number;
};

/** Bound to the currently authenticated user; callers cannot choose a user. */
export interface ClarityMemorySource {
  retrieve(query: ClarityMemoryQuery): Promise<ClarityMemoryContext>;
}

export const clarityMemoryClasses = [
  "durable_memory",
  "current_state",
] as const;
export const clarityMemoryTruthStates = ["fact", "inference", "unknown"] as const;
export const clarityMemoryMaterialities = ["low", "medium", "high"] as const;
export const clarityMemorySourceTypes = [
  "onboarding_confirmation",
  "onboarding_message",
  "clarity_message",
] as const;

export type ClarityMemoryClass = (typeof clarityMemoryClasses)[number];
export type ClarityMemoryTruthState = (typeof clarityMemoryTruthStates)[number];
export type ClarityMemoryMateriality =
  (typeof clarityMemoryMaterialities)[number];
export type ClarityMemorySourceType = (typeof clarityMemorySourceTypes)[number];

export type ClarityLedgerMemoryItem = {
  id: string;
  memoryClass: ClarityMemoryClass;
  truthState: ClarityMemoryTruthState;
  topic: string;
  statement: string;
  confidence: "low" | "medium" | "high";
  materiality: ClarityMemoryMateriality;
  observedAt: string | null;
  effectiveOn: string | null;
  reviewAfter: string | null;
  confirmedAt: string;
  freshness: "durable" | "fresh" | "stale";
  sourceClasses: ClarityMemorySourceType[];
};

export type ClarityMemoryContext = {
  durableMemory: ClarityLedgerMemoryItem[];
  currentState: ClarityLedgerMemoryItem[];
  staleCurrentState: ClarityLedgerMemoryItem[];
  materialUnknowns: ClarityLedgerMemoryItem[];
  omissions: {
    durableMemory: number;
    currentState: number;
    materialUnknowns: number;
  };
};

export type ClarityMemoryReadRow = {
  id: string;
  memory_class: ClarityMemoryClass;
  truth_state: ClarityMemoryTruthState;
  topic: string;
  statement: string;
  confidence: "low" | "medium" | "high";
  materiality: ClarityMemoryMateriality;
  observed_at: string | null;
  effective_on: string | null;
  review_after: string | null;
  confirmed_at: string;
  clarity_memory_item_sources: Array<{
    source_type: ClarityMemorySourceType;
  }>;
};

export const CLARITY_MEMORY_READ_LIMITS = {
  durableMemory: 16,
  currentState: 16,
  materialUnknowns: 8,
} as const;

export function buildClarityMemoryContext(
  rows: ClarityMemoryReadRow[],
  now = new Date(),
): ClarityMemoryContext {
  const ranked = rows.map((row) => toLedgerItem(row, now)).sort(compareMemoryItems);
  const durableCandidates = ranked.filter(
    (item) => item.memoryClass === "durable_memory" && item.truthState !== "unknown",
  );
  const currentCandidates = ranked.filter(
    (item) => item.memoryClass === "current_state" && item.truthState !== "unknown",
  );
  const materialUnknownCandidates = ranked.filter(
    (item) => item.truthState === "unknown" && item.materiality !== "low",
  );
  const boundedCurrent = currentCandidates.slice(
    0,
    CLARITY_MEMORY_READ_LIMITS.currentState,
  );

  return {
    durableMemory: durableCandidates.slice(
      0,
      CLARITY_MEMORY_READ_LIMITS.durableMemory,
    ),
    currentState: boundedCurrent.filter((item) => item.freshness === "fresh"),
    staleCurrentState: boundedCurrent.filter(
      (item) => item.freshness === "stale",
    ),
    materialUnknowns: materialUnknownCandidates.slice(
      0,
      CLARITY_MEMORY_READ_LIMITS.materialUnknowns,
    ),
    omissions: {
      durableMemory: Math.max(
        0,
        durableCandidates.length - CLARITY_MEMORY_READ_LIMITS.durableMemory,
      ),
      currentState: Math.max(
        0,
        currentCandidates.length - CLARITY_MEMORY_READ_LIMITS.currentState,
      ),
      materialUnknowns: Math.max(
        0,
        materialUnknownCandidates.length -
          CLARITY_MEMORY_READ_LIMITS.materialUnknowns,
      ),
    },
  };
}

function toLedgerItem(
  row: ClarityMemoryReadRow,
  now: Date,
): ClarityLedgerMemoryItem {
  return {
    id: row.id,
    memoryClass: row.memory_class,
    truthState: row.truth_state,
    topic: row.topic,
    statement: row.statement,
    confidence: row.confidence,
    materiality: row.materiality,
    observedAt: row.observed_at,
    effectiveOn: row.effective_on,
    reviewAfter: row.review_after,
    confirmedAt: row.confirmed_at,
    freshness:
      row.memory_class === "durable_memory"
        ? "durable"
        : row.review_after !== null &&
            new Date(row.review_after).getTime() <= now.getTime()
          ? "stale"
          : "fresh",
    sourceClasses: [
      ...new Set(
        row.clarity_memory_item_sources.map((source) => source.source_type),
      ),
    ],
  };
}

function compareMemoryItems(
  left: ClarityLedgerMemoryItem,
  right: ClarityLedgerMemoryItem,
) {
  return (
    materialityRank(right.materiality) - materialityRank(left.materiality) ||
    freshnessRank(left.freshness) - freshnessRank(right.freshness) ||
    Date.parse(right.observedAt ?? right.confirmedAt) -
      Date.parse(left.observedAt ?? left.confirmedAt) ||
    left.id.localeCompare(right.id)
  );
}

function materialityRank(value: ClarityMemoryMateriality) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function freshnessRank(value: ClarityLedgerMemoryItem["freshness"]) {
  if (value === "fresh") return 0;
  if (value === "durable") return 1;
  return 2;
}
