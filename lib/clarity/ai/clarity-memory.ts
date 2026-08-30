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

/**
 * One continuous conversation archive for one authenticated user. This is a
 * contract only; V1 does not persist conversation messages.
 */
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

export type ClarityMemoryContext = {
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
