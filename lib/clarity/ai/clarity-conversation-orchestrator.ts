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
} from "./clarity-provider";
import { createClarityModelProvider } from "./clarity-provider-server";
import { buildClaritySystemPrompt, buildClarityUserPrompt } from "./clarity-prompt";

export async function runClarityConversationTurn(input: {
  userMessageId: string;
  userMessage: string;
  invocation: ClarityInvocationDescriptor;
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

  try {
    const result = await provider.generate({
      systemPrompt: buildClaritySystemPrompt(),
      userPrompt: buildClarityUserPrompt({
        userMessage: input.userMessage,
        context,
        history: conversation.messages.filter(
          (message) => message.id !== input.userMessageId,
        ),
      }),
    });
    structuredParseSucceeded = true;
    await appendClarityResponse(input.userMessageId, result.output, result);
    logClarityModelEvent({
      provider: result.provider,
      model: result.model,
      invocationType: input.invocation.type,
      latencyMs: result.latencyMs,
      success: true,
      structuredParseSuccess: true,
      repaired: result.repaired,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      reasoningEffort: provider.reasoningEffort ?? "provider_default",
    });
    return result.output;
  } catch (error) {
    logClarityModelEvent({
      provider: provider.provider,
      model: provider.model,
      invocationType: input.invocation.type,
      latencyMs: Date.now() - startedAt,
      success: false,
      structuredParseSuccess: structuredParseSucceeded,
      errorCode:
        error instanceof ClarityProviderError
          ? error.code
          : error instanceof Error
            ? error.name
            : "UnknownClarityProviderError",
      reasoningEffort: provider.reasoningEffort ?? "provider_default",
    });
    throw error;
  }
}

function logClarityModelEvent(
  event: Record<string, string | number | boolean | null>,
) {
  // Never include messages, context, provider payloads, or hidden reasoning.
  console.info("clarity_model_request", event);
}
