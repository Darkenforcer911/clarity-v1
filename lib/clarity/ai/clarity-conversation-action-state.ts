export type ClarityConversationActionState = {
  error: string | null;
  fieldError?: string;
  retryMessageId?: string;
  retryKind?: "response" | "research";
  fallbackResponse?: string;
  completedAt?: number;
  success?: boolean;
};

export const initialClarityConversationActionState: ClarityConversationActionState = {
  error: null,
};
