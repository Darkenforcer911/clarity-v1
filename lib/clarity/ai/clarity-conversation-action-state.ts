export type ClarityConversationActionState = {
  error: string | null;
  fieldError?: string;
  retryMessageId?: string;
  completedAt?: number;
  success?: boolean;
};

export const initialClarityConversationActionState: ClarityConversationActionState = {
  error: null,
};
