import "server-only";

import { z } from "zod";

import type { Json } from "@/lib/supabase/database.types";
import type { ClarityStructuredProviderResult } from "./ai/clarity-provider";
import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";
import {
  emptyOnboardingProgress,
  emptyOnboardingUnderstanding,
  onboardingIntelligenceResponseSchema,
  onboardingProgressSchema,
  onboardingSynthesisSchema,
  onboardingUnderstandingSchema,
  type OnboardingIntelligenceResponse,
  type OnboardingProgress,
  type OnboardingSynthesis,
  type OnboardingUnderstanding,
} from "./onboarding-intelligence";

const sessionStatusSchema = z.enum(["in_progress", "completed", "abandoned"]);

const storedSessionSchema = z.object({
  id: z.string().uuid(),
  status: sessionStatusSchema,
  current_step: z.string(),
  understanding: z.unknown(),
  progress: z.unknown(),
  synthesis: z.unknown().nullable(),
  confirmed_snapshot: z.unknown().nullable(),
  turn_count: z.number().int().nonnegative(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
});

const storedMessageSchema = z.object({
  id: z.string().uuid(),
  onboarding_session_id: z.string().uuid(),
  role: z.enum(["user", "clarity"]),
  content: z.string(),
  created_at: z.string(),
  response_to_message_id: z.string().uuid().nullable(),
  mode: z.string().nullable(),
  structured_output: z.unknown().nullable(),
});

const confirmedSnapshotSchema = z.object({
  version: z.number().int().positive(),
  understanding: onboardingUnderstandingSchema,
  progress: onboardingProgressSchema,
  synthesis: onboardingSynthesisSchema,
  confirmedAt: z.string(),
});

export type OnboardingConversationMessage = z.infer<typeof storedMessageSchema>;

export type OnboardingPageState = {
  sessionId: string | null;
  status: "not_started" | "in_progress" | "completed";
  messages: OnboardingConversationMessage[];
  understanding: OnboardingUnderstanding;
  progress: OnboardingProgress;
  synthesis: OnboardingSynthesis | null;
  confirmedSnapshot: z.infer<typeof confirmedSnapshotSchema> | null;
  turnCount: number;
  profile: {
    name: string | null;
    timezone: string;
  };
};

export async function getOnboardingPageState(): Promise<OnboardingPageState> {
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const columns =
    "id, status, current_step, understanding, progress, synthesis, confirmed_snapshot, turn_count, started_at, completed_at";

  const { data: activeSession, error: activeError } = await supabase
    .from("onboarding_sessions")
    .select(columns)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .maybeSingle();
  if (activeError) throw new Error(activeError.message);

  let rawSession = activeSession;
  if (!rawSession) {
    const { data: completedSession, error: completedError } = await supabase
      .from("onboarding_sessions")
      .select(columns)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (completedError) throw new Error(completedError.message);
    rawSession = completedSession;
  }

  if (!rawSession) {
    return {
      sessionId: null,
      status: "not_started",
      messages: [],
      understanding: emptyOnboardingUnderstanding(),
      progress: emptyOnboardingProgress(),
      synthesis: null,
      confirmedSnapshot: null,
      turnCount: 0,
      profile: { name: profile.name, timezone: profile.timezone },
    };
  }

  const session = storedSessionSchema.parse(rawSession);
  const { data: rawMessages, error: messagesError } = await supabase
    .from("onboarding_messages")
    .select(
      "id, onboarding_session_id, role, content, created_at, response_to_message_id, mode, structured_output",
    )
    .eq("user_id", user.id)
    .eq("onboarding_session_id", session.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (messagesError) throw new Error(messagesError.message);

  return {
    sessionId: session.id,
    status: session.status === "completed" ? "completed" : "in_progress",
    messages: storedMessageSchema.array().parse(rawMessages ?? []),
    understanding: parseOrFallback(
      onboardingUnderstandingSchema,
      session.understanding,
      emptyOnboardingUnderstanding(),
    ),
    progress: parseOrFallback(
      onboardingProgressSchema,
      session.progress,
      emptyOnboardingProgress(),
    ),
    synthesis: parseNullable(onboardingSynthesisSchema, session.synthesis),
    confirmedSnapshot: parseNullable(
      confirmedSnapshotSchema,
      session.confirmed_snapshot,
    ),
    turnCount: session.turn_count,
    profile: { name: profile.name, timezone: profile.timezone },
  };
}

export async function appendOnboardingUserMessage(content: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.rpc(
    "append_onboarding_user_message_v1",
    { p_content: content },
  );
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error("Onboarding message was not saved.");
  return result;
}

export async function appendOnboardingResponse(
  userMessageId: string,
  output: OnboardingIntelligenceResponse,
  result: ClarityStructuredProviderResult<OnboardingIntelligenceResponse>,
) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const structuredOutput = onboardingIntelligenceResponseSchema.parse(output);
  const { data, error } = await supabase.rpc("append_onboarding_response_v1", {
    p_user_message_id: userMessageId,
    p_content: structuredOutput.assistantMessage,
    p_mode: structuredOutput.mode,
    p_structured_output: structuredOutput as unknown as Json,
    p_model_provider: result.provider,
    p_model_version: result.model,
    p_latency_ms: result.latencyMs,
    ...(result.usage.inputTokens === null
      ? {}
      : { p_input_tokens: result.usage.inputTokens }),
    ...(result.usage.outputTokens === null
      ? {}
      : { p_output_tokens: result.usage.outputTokens }),
  });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export async function loadOnboardingTurnContext(userMessageId: string) {
  const parsedId = z.string().uuid().parse(userMessageId);
  const state = await getOnboardingPageState();
  if (state.status !== "in_progress" || !state.sessionId) {
    throw new Error("Onboarding session is not active.");
  }
  const userMessage = state.messages.find(
    (message) => message.id === parsedId && message.role === "user",
  );
  if (!userMessage) throw new Error("Onboarding message not found.");
  const alreadyAnswered = state.messages.some(
    (message) => message.response_to_message_id === parsedId,
  );
  const latestUserMessage = state.messages.findLast(
    (message) => message.role === "user",
  );
  if (latestUserMessage?.id !== parsedId) {
    throw new Error("Only the latest onboarding answer can be processed.");
  }

  return { state, userMessage, alreadyAnswered };
}

export async function confirmOnboardingUnderstanding(sessionId: string) {
  const parsedId = z.string().uuid().parse(sessionId);
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.rpc(
    "confirm_onboarding_understanding_v1",
    { p_onboarding_session_id: parsedId },
  );
  if (error) throw new Error(error.message);
  return confirmedSnapshotSchema.parse(data);
}

function parseOrFallback<Output>(
  schema: z.ZodType<Output>,
  value: unknown,
  fallback: Output,
) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function parseNullable<Output>(schema: z.ZodType<Output>, value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
