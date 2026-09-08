import "server-only";

import {
  assembleClarityContext,
  invocationFromDescriptor,
  type ClarityInvocationDescriptor,
} from "./clarity-context-assembler";
import {
  appendClarityResponse,
  loadClarityConversation,
} from "./clarity-conversation-service";
import {
  ClarityProviderError,
  type ClarityModelProvider,
  type ClarityProviderResult,
} from "./clarity-provider";
import { createClarityModelProvider } from "./clarity-provider-server";
import { researchCountryCode } from "./clarity-research";
import {
  buildClarityResearchFallback,
  ClarityResearchFallbackError,
} from "./clarity-research-fallback";
import { normalizeClarityVisibleResponse } from "./clarity-response-presentation";
import { runClarityTurnSingleFlight } from "./clarity-turn-single-flight";
import {
  appendResearchNeedToUserPrompt,
  buildClarityResearchSystemPrompt,
  buildClaritySystemPrompt,
  buildClarityUserPrompt,
} from "./clarity-prompt";

export async function runClarityConversationTurn(input: {
  userMessageId: string;
  userMessage: string;
  invocation: ClarityInvocationDescriptor;
  images?: import("./clarity-provider").ClarityProviderImage[];
  provider?: ClarityModelProvider;
}) {
  return runClarityTurnSingleFlight(input.userMessageId, () =>
    executeClarityConversationTurn(input),
  );
}

export async function runClarityResearchRetryTurn(input: {
  userMessageId: string;
  userMessage: string;
  invocation: ClarityInvocationDescriptor;
  images?: import("./clarity-provider").ClarityProviderImage[];
  provider?: ClarityModelProvider;
}) {
  return runClarityTurnSingleFlight(input.userMessageId, () =>
    executeClarityResearchRetryTurn(input),
  );
}

async function executeClarityConversationTurn(input: {
  userMessageId: string;
  userMessage: string;
  invocation: ClarityInvocationDescriptor;
  images?: import("./clarity-provider").ClarityProviderImage[];
  provider?: ClarityModelProvider;
}) {
  const invocation = invocationFromDescriptor(input.invocation);
  if (input.invocation.type !== "general" && !invocation) {
    throw new Error("Invalid Clarity invocation.");
  }

  const [context, conversation] = await Promise.all([
    assembleClarityContext(invocation),
    loadClarityConversation(24),
  ]);
  const provider = input.provider ?? createClarityModelProvider();
  const startedAt = Date.now();
  let structuredParseSucceeded = false;
  let researchAttempted = false;

  try {
    const userPrompt = buildClarityUserPrompt({
      userMessage: input.userMessage,
      context,
      history: conversation.messages.filter(
        (message) => message.id !== input.userMessageId,
      ),
    });
    const initialResult = await provider.generate({
      systemPrompt: buildClaritySystemPrompt(),
      userPrompt,
      images: input.images,
    });
    structuredParseSucceeded = true;
    let result = initialResult;
    if (initialResult.output.requiresCurrentVerification) {
      try {
        result = await runResearchStage({
          provider,
          initialResult,
          userPrompt,
          images: input.images,
          verificationNeed: initialResult.output.verificationNeed!,
          location: researchLocation(context),
          onStart: () => {
            researchAttempted = true;
          },
        });
      } catch (error) {
        if (
          error instanceof ClarityProviderError &&
          error.code === "research_failure"
        ) {
          throw new ClarityResearchFallbackError(
            buildClarityResearchFallback(
              normalizeClarityVisibleResponse(initialResult.output.response),
            ),
          );
        }
        throw error;
      }
    }
    const presentedResult = await persistPresentedResult(
      input.userMessageId,
      result,
    );
    logClarityModelEvent({
      provider: result.provider,
      model: result.model,
      invocationType: input.invocation.type,
      latencyMs: result.latencyMs,
      totalTurnLatencyMs: Date.now() - startedAt,
      success: true,
      structuredParseSuccess: true,
      repaired: result.repaired,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      researchUsed: Boolean(result.research),
      sourceCount: result.research?.sourceCount ?? 0,
      webSearchToolCallCount: result.research?.toolCallCount ?? 0,
      researchLatencyMs: result.research?.latencyMs ?? 0,
      reasoningEffort: provider.reasoningEffort ?? "provider_default",
    });
    return presentedResult.output;
  } catch (error) {
    logClarityModelEvent({
      provider: provider.provider,
      model: provider.model,
      invocationType: input.invocation.type,
      latencyMs: Date.now() - startedAt,
      totalTurnLatencyMs: Date.now() - startedAt,
      success: false,
      structuredParseSuccess: structuredParseSucceeded,
      errorCode:
        error instanceof ClarityProviderError
          ? error.code
          : error instanceof Error
            ? error.name
            : "UnknownClarityProviderError",
      researchUsed: researchAttempted,
      sourceCount: 0,
      webSearchToolCallCount: 0,
      researchLatencyMs: 0,
      reasoningEffort: provider.reasoningEffort ?? "provider_default",
    });
    throw error;
  }
}

async function executeClarityResearchRetryTurn(input: {
  userMessageId: string;
  userMessage: string;
  invocation: ClarityInvocationDescriptor;
  images?: import("./clarity-provider").ClarityProviderImage[];
  provider?: ClarityModelProvider;
}) {
  const invocation = invocationFromDescriptor(input.invocation);
  if (input.invocation.type !== "general" && !invocation) {
    throw new Error("Invalid Clarity invocation.");
  }
  const [context, conversation] = await Promise.all([
    assembleClarityContext(invocation),
    loadClarityConversation(24),
  ]);
  const provider = input.provider ?? createClarityModelProvider();
  const startedAt = Date.now();

  try {
    const userPrompt = buildClarityUserPrompt({
      userMessage: input.userMessage,
      context,
      history: conversation.messages.filter(
        (message) => message.id !== input.userMessageId,
      ),
    });
    const result = await provider.research({
      systemPrompt: buildClarityResearchSystemPrompt(),
      userPrompt: appendResearchNeedToUserPrompt(
        userPrompt,
        "Identify and verify only the current-world facts that materially affect the user's question.",
      ),
      images: input.images,
      userLocation: researchLocation(context),
    });
    const presentedResult = await persistPresentedResult(
      input.userMessageId,
      result,
    );
    logClarityModelEvent({
      provider: result.provider,
      model: result.model,
      invocationType: input.invocation.type,
      latencyMs: result.latencyMs,
      totalTurnLatencyMs: Date.now() - startedAt,
      success: true,
      structuredParseSuccess: true,
      repaired: result.repaired,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      researchUsed: true,
      sourceCount: result.research?.sourceCount ?? 0,
      webSearchToolCallCount: result.research?.toolCallCount ?? 0,
      researchLatencyMs: result.research?.latencyMs ?? 0,
      reasoningEffort: provider.reasoningEffort ?? "provider_default",
    });
    return presentedResult.output;
  } catch (error) {
    logClarityModelEvent({
      provider: provider.provider,
      model: provider.model,
      invocationType: input.invocation.type,
      latencyMs: Date.now() - startedAt,
      totalTurnLatencyMs: Date.now() - startedAt,
      success: false,
      structuredParseSuccess: false,
      errorCode:
        error instanceof ClarityProviderError
          ? error.code
          : error instanceof Error
            ? error.name
            : "UnknownClarityProviderError",
      researchUsed: true,
      sourceCount: 0,
      webSearchToolCallCount: 0,
      researchLatencyMs: 0,
      reasoningEffort: provider.reasoningEffort ?? "provider_default",
    });
    throw error;
  }
}

async function runResearchStage(input: {
  provider: ClarityModelProvider;
  initialResult: ClarityProviderResult;
  userPrompt: string;
  images?: import("./clarity-provider").ClarityProviderImage[];
  verificationNeed: string;
  location: {
    city: string | null;
    countryCode: string | null;
    timezone: string;
  };
  onStart: () => void;
}) {
  input.onStart();
  const researched = await input.provider.research({
    systemPrompt: buildClarityResearchSystemPrompt(),
    userPrompt: appendResearchNeedToUserPrompt(
      input.userPrompt,
      input.verificationNeed,
    ),
    images: input.images,
    userLocation: input.location,
  });

  return {
    ...researched,
    latencyMs: input.initialResult.latencyMs + researched.latencyMs,
    usage: {
      inputTokens: addNullableCounts(
        input.initialResult.usage.inputTokens,
        researched.usage.inputTokens,
      ),
      outputTokens: addNullableCounts(
        input.initialResult.usage.outputTokens,
        researched.usage.outputTokens,
      ),
    },
    repaired: input.initialResult.repaired || researched.repaired,
  } satisfies ClarityProviderResult;
}

function addNullableCounts(left: number | null, right: number | null) {
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0);
}

async function persistPresentedResult(
  userMessageId: string,
  result: ClarityProviderResult,
) {
  const presentedResult = {
    ...result,
    output: {
      ...result.output,
      response: normalizeClarityVisibleResponse(
        result.output.response,
        result.research?.sources,
      ),
    },
  } satisfies ClarityProviderResult;
  if (!presentedResult.output.response) {
    throw new ClarityProviderError(
      "Clarity returned an empty visible response.",
      "invalid_output",
    );
  }
  await appendClarityResponse(
    userMessageId,
    presentedResult.output,
    presentedResult,
  );
  return presentedResult;
}

function researchLocation(
  context: Awaited<ReturnType<typeof assembleClarityContext>>,
) {
  return {
    city: context.profile.city,
    countryCode: researchCountryCode(context.profile.country),
    timezone: context.profile.timezone,
  };
}

function logClarityModelEvent(
  event: Record<string, string | number | boolean | null>,
) {
  // Never include messages, context, provider payloads, or hidden reasoning.
  console.info("clarity_model_request", event);
}
