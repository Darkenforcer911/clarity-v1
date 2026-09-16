import assert from "node:assert/strict";
import test from "node:test";

import {
  latestUnansweredOnboardingMessageId,
  onboardingRetryCardState,
} from "./onboarding-retry-state.ts";

const userMessageId = "11111111-1111-4111-8111-111111111111";
const assistantMessageId = "22222222-2222-4222-8222-222222222222";
const idleState = { status: "idle", message: null };

test("a failed persisted user turn exposes Retry", () => {
  const retryCard = onboardingRetryCardState({
    persistedUnansweredMessageId: userMessageId,
    persistedAnsweredMessageIds: [],
    sendState: {
      status: "error",
      message: "Your answer is saved, so you can retry.",
      retryMessageId: userMessageId,
    },
    retryState: idleState,
  });

  assert.equal(retryCard?.messageId, userMessageId);
  assert.match(retryCard?.message ?? "", /retry/i);
});

test("successful Retry immediately suppresses the stale failed send state", () => {
  const retryCard = onboardingRetryCardState({
    persistedUnansweredMessageId: userMessageId,
    persistedAnsweredMessageIds: [],
    sendState: {
      status: "error",
      message: "Your answer is saved, so you can retry.",
      retryMessageId: userMessageId,
    },
    retryState: {
      status: "success",
      message: null,
      retryMessageId: userMessageId,
    },
  });

  assert.equal(retryCard, null);
});

test("a persisted assistant response wins over stale errors after reload", () => {
  const messages = [
    {
      id: userMessageId,
      role: "user",
      response_to_message_id: null,
    },
    {
      id: assistantMessageId,
      role: "clarity",
      response_to_message_id: userMessageId,
    },
  ];
  const persistedUnansweredMessageId =
    latestUnansweredOnboardingMessageId(messages);

  assert.equal(persistedUnansweredMessageId, null);
  assert.equal(
    onboardingRetryCardState({
      persistedUnansweredMessageId,
      persistedAnsweredMessageIds: [userMessageId],
      sendState: {
        status: "error",
        message: "Your answer is saved, so you can retry.",
        retryMessageId: userMessageId,
      },
      retryState: idleState,
    }),
    null,
  );
});

test("a genuinely unanswered persisted turn remains retryable after reload", () => {
  const persistedUnansweredMessageId = latestUnansweredOnboardingMessageId([
    {
      id: userMessageId,
      role: "user",
      response_to_message_id: null,
    },
  ]);
  const retryCard = onboardingRetryCardState({
    persistedUnansweredMessageId,
    persistedAnsweredMessageIds: [],
    sendState: idleState,
    retryState: idleState,
  });

  assert.equal(persistedUnansweredMessageId, userMessageId);
  assert.equal(retryCard?.messageId, userMessageId);
});
