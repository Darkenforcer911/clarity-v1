import "server-only";

import { z } from "zod";

import type { Json } from "@/lib/supabase/database.types";
import {
  loadOnboardingAttachmentsForMessages,
} from "./ai/clarity-attachment-service";
import type { ClarityMessageAttachment } from "./ai/clarity-attachments";
import type { ClarityStructuredProviderResult } from "./ai/clarity-provider";
import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";
import { getLocalDate } from "./date-time";
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
  user_draft: z.unknown(),
  turn_count: z.number().int().nonnegative(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
});

const onboardingBasicContextSchema = z.object({
  preferredName: z.string().trim().min(1).max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(100),
});

const storedBasicContextSchema = z.object({
  preferred_name: z.string().trim().min(1).max(200),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(100),
});

const legacyOnboardingIdentitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(100),
});

export type OnboardingBasicContext = z.infer<
  typeof onboardingBasicContextSchema
>;

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

export type OnboardingConversationMessage = z.infer<typeof storedMessageSchema> & {
  attachments: ClarityMessageAttachment[];
};

export type OnboardingPageState = {
  sessionId: string | null;
  status: "not_started" | "in_progress" | "completed";
  messages: OnboardingConversationMessage[];
  understanding: OnboardingUnderstanding;
  progress: OnboardingProgress;
  synthesis: OnboardingSynthesis | null;
  confirmedSnapshot: z.infer<typeof confirmedSnapshotSchema> | null;
  turnCount: number;
  basicContextComplete: boolean;
  profile: {
    preferredName: string;
    dateOfBirth: string | null;
    age: number | null;
    city: string;
    country: string;
    timezone: string;
  };
};

export type OnboardingStateLoadTimingEvent = {
  phase: "session_messages" | "attachment_resolution";
  durationMs: number;
};

export async function getOnboardingPageState(options?: {
  onTiming?: (event: OnboardingStateLoadTimingEvent) => void;
}): Promise<OnboardingPageState> {
  const stateLoadStartedAt = performance.now();
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const columns =
    "id, status, current_step, understanding, progress, synthesis, confirmed_snapshot, user_draft, turn_count, started_at, completed_at";

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
    emitStateLoadTiming(options, {
      phase: "session_messages",
      durationMs: performance.now() - stateLoadStartedAt,
    });
    const basicContext = profileBasicContext(profile);
    return {
      sessionId: null,
      status: "not_started",
      messages: [],
      understanding: emptyOnboardingUnderstanding(),
      progress: emptyOnboardingProgress(),
      synthesis: null,
      confirmedSnapshot: null,
      turnCount: 0,
      basicContextComplete: false,
      profile: promptProfile(basicContext),
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

  const storedBasicContext = basicContextFromDraft(session.user_draft);
  const basicContext = storedBasicContext ?? profileBasicContext(profile);
  const storedMessages = storedMessageSchema.array().parse(rawMessages ?? []);
  emitStateLoadTiming(options, {
    phase: "session_messages",
    durationMs: performance.now() - stateLoadStartedAt,
  });
  const attachmentResolutionStartedAt = performance.now();
  const attachmentsByMessage = await loadOnboardingAttachmentsForMessages(
    storedMessages.map((message) => message.id),
  );
  emitStateLoadTiming(options, {
    phase: "attachment_resolution",
    durationMs: performance.now() - attachmentResolutionStartedAt,
  });
  const messages = storedMessages.map((message) => ({
    ...message,
    attachments: attachmentsByMessage.get(message.id) ?? [],
  }));

  return {
    sessionId: session.id,
    status: session.status === "completed" ? "completed" : "in_progress",
    messages,
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
    basicContextComplete:
      storedBasicContext !== null ||
      messages.length > 0 ||
      session.status === "completed",
    profile: promptProfile(basicContext),
  };
}

export async function saveOnboardingBasicContext(
  input: OnboardingBasicContext,
) {
  const basicContext = onboardingBasicContextSchema.parse(input);
  const { supabase, user } = await getAuthenticatedUserAndProfile();
  const { data: session, error: sessionError } = await supabase
    .from("onboarding_sessions")
    .select("user_draft")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);

  const existingDraft = isJsonObject(session?.user_draft)
    ? session.user_draft
    : {};
  const { data, error } = await supabase.rpc("save_onboarding_session", {
    p_onboarding_version: 2,
    p_current_step: "conversation",
    p_user_draft: {
      ...existingDraft,
      basic_context: {
        preferred_name: basicContext.preferredName,
        date_of_birth: basicContext.dateOfBirth,
        city: basicContext.city,
        country: basicContext.country,
        timezone: basicContext.timezone,
      },
    } as Json,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function appendOnboardingUserMessage(
  content: string,
  attachmentIds: string[] = [],
) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.rpc(
    "append_onboarding_user_message_v2",
    { p_content: content, p_attachment_ids: attachmentIds },
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

export async function loadOnboardingTurnContext(
  userMessageId: string,
  options?: {
    onTiming?: (event: OnboardingStateLoadTimingEvent) => void;
  },
) {
  const parsedId = z.string().uuid().parse(userMessageId);
  const state = await getOnboardingPageState(options);
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

function emitStateLoadTiming(
  options: {
    onTiming?: (event: OnboardingStateLoadTimingEvent) => void;
  } | undefined,
  event: OnboardingStateLoadTimingEvent,
) {
  try {
    options?.onTiming?.(event);
  } catch {
    // Diagnostics must never affect onboarding state loading.
  }
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

function basicContextFromDraft(value: unknown): OnboardingBasicContext | null {
  if (!isJsonObject(value)) return null;
  const current = storedBasicContextSchema.safeParse(value.basic_context);
  if (current.success) {
    return {
      preferredName: current.data.preferred_name,
      dateOfBirth: current.data.date_of_birth,
      city: current.data.city,
      country: current.data.country,
      timezone: current.data.timezone,
    };
  }

  const legacy = legacyOnboardingIdentitySchema.safeParse(value.identity);
  if (!legacy.success) return null;
  return {
    preferredName: legacy.data.name,
    dateOfBirth: legacy.data.dateOfBirth,
    city: legacy.data.city,
    country: legacy.data.country,
    timezone: legacy.data.timezone,
  };
}

function profileBasicContext(profile: {
  name: string | null;
  date_of_birth: string | null;
  city: string | null;
  country: string | null;
  timezone: string;
}): OnboardingBasicContext {
  return {
    preferredName: profile.name?.trim() ?? "",
    dateOfBirth: profile.date_of_birth ?? "",
    city: profile.city?.trim() ?? "",
    country: profile.country?.trim() ?? "",
    timezone: profile.timezone,
  };
}

function promptProfile(basicContext: OnboardingBasicContext) {
  return {
    ...basicContext,
    dateOfBirth: basicContext.dateOfBirth || null,
    age: basicContext.dateOfBirth
      ? ageOnDate(
          basicContext.dateOfBirth,
          getLocalDate(basicContext.timezone),
        )
      : null,
  };
}

function ageOnDate(dateOfBirth: string, localDate: string) {
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
  const [year, month, day] = localDate.split("-").map(Number);
  if (
    !birthYear ||
    !birthMonth ||
    !birthDay ||
    !year ||
    !month ||
    !day
  ) {
    return null;
  }
  return (
    year -
    birthYear -
    (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0)
  );
}

function isJsonObject(value: unknown): value is Record<string, Json> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
