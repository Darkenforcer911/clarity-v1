import type { OnboardingActionState } from "./onboarding-action-state";

type OnboardingRetryMessage = {
  id: string;
  role: "user" | "clarity";
  response_to_message_id: string | null;
};

export function latestUnansweredOnboardingMessageId(
  messages: readonly OnboardingRetryMessage[],
) {
  const answeredMessageIds = new Set(answeredOnboardingMessageIds(messages));

  return (
    [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "user" && !answeredMessageIds.has(message.id),
      )?.id ?? null
  );
}

export function answeredOnboardingMessageIds(
  messages: readonly OnboardingRetryMessage[],
) {
  return messages.flatMap((message) =>
    message.role === "clarity" && message.response_to_message_id
      ? [message.response_to_message_id]
      : [],
  );
}

export function onboardingRetryCardState(input: {
  persistedUnansweredMessageId: string | null;
  persistedAnsweredMessageIds: readonly string[];
  sendState: OnboardingActionState;
  retryState: OnboardingActionState;
}) {
  const messageId =
    input.persistedUnansweredMessageId ?? input.sendState.retryMessageId;
  if (!messageId) return null;
  if (input.persistedAnsweredMessageIds.includes(messageId)) return null;

  const retryStateMatches = input.retryState.retryMessageId === messageId;
  if (retryStateMatches && input.retryState.status === "success") return null;

  const sendStateMatches = input.sendState.retryMessageId === messageId;
  return {
    messageId,
    message:
      (retryStateMatches ? input.retryState.message : null) ??
      (sendStateMatches ? input.sendState.message : null) ??
      "Clarity couldn’t respond just now. Your answer is saved, so you can retry.",
  };
}
