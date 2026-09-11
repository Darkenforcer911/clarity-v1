import "server-only";

import {
  createClarityStructuredProvider,
} from "./ai/clarity-provider-server";
import type {
  ClarityProviderRequest,
  ClarityStructuredOutputContract,
  OpenAIClarityProvider,
} from "./ai/clarity-provider";
import { runClarityTurnSingleFlight } from "./ai/clarity-turn-single-flight";
import {
  ONBOARDING_MINIMUM_MEANINGFUL_TURNS,
  ONBOARDING_RICH_FIRST_TURN_CHARACTERS,
  ONBOARDING_SOFT_QUESTION_CAP,
  enforceOnboardingStoppingPolicy,
  onboardingIntelligenceResponseJsonSchema,
  onboardingIntelligenceResponseSchema,
  validateOnboardingEvidenceReferences,
  type OnboardingIntelligenceResponse,
} from "./onboarding-intelligence";
import {
  appendOnboardingResponse,
  loadOnboardingTurnContext,
} from "./onboarding-service";
import {
  buildOnboardingSystemPrompt,
  buildOnboardingUserPrompt,
} from "./onboarding-prompt";

type OnboardingStructuredProvider = Pick<
  OpenAIClarityProvider,
  "provider" | "model" | "reasoningEffort" | "generateStructured"
>;

export async function runOnboardingConversationTurn(input: {
  userMessageId: string;
  provider?: OnboardingStructuredProvider;
}) {
  return runClarityTurnSingleFlight(input.userMessageId, () =>
    executeOnboardingConversationTurn(input),
  );
}

async function executeOnboardingConversationTurn(input: {
  userMessageId: string;
  provider?: OnboardingStructuredProvider;
}) {
  const context = await loadOnboardingTurnContext(input.userMessageId);
  if (context.alreadyAnswered) return null;

  const userMessages = context.state.messages.filter(
    (message) => message.role === "user",
  );
  const assistantQuestionCount = context.state.messages.filter(
    (message) => message.role === "clarity" && message.content.includes("?"),
  ).length;
  const allowedMessageIds = new Set(userMessages.map((message) => message.id));
  const latestUserMessage = context.userMessage.content;
  const contract: ClarityStructuredOutputContract<OnboardingIntelligenceResponse> = {
    name: "clarity_onboarding_response",
    schema: onboardingIntelligenceResponseJsonSchema as unknown as Record<
      string,
      unknown
    >,
    maxOutputTokens: 4_500,
    parse: (value) => {
      const parsed = onboardingIntelligenceResponseSchema.parse(value);
      validateOnboardingEvidenceReferences(parsed, allowedMessageIds);
      const earlySynthesis =
        parsed.readiness.readyForSynthesis &&
        userMessages.length < ONBOARDING_MINIMUM_MEANINGFUL_TURNS &&
        !(
          userMessages.length === 1 &&
          latestUserMessage.trim().length >=
            ONBOARDING_RICH_FIRST_TURN_CHARACTERS
        );
      if (earlySynthesis) {
        throw new Error("Onboarding synthesis is premature.");
      }
      if (
        assistantQuestionCount >= ONBOARDING_SOFT_QUESTION_CAP &&
        !parsed.readiness.readyForSynthesis
      ) {
        throw new Error(
          "Onboarding reached the soft question cap and must synthesize with explicit unknowns.",
        );
      }
      return enforceOnboardingStoppingPolicy({
        output: parsed,
        meaningfulUserTurns: userMessages.length,
        latestUserMessage,
      });
    },
  };
  const provider = input.provider ?? createClarityStructuredProvider();
  const request: ClarityProviderRequest = {
    systemPrompt: buildOnboardingSystemPrompt(),
    userPrompt: buildOnboardingUserPrompt({
      messages: context.state.messages,
      understanding: context.state.understanding,
      progress: context.state.progress,
      synthesis: context.state.synthesis,
      userTurnCount: userMessages.length,
      assistantQuestionCount,
      profile: context.state.profile,
    }),
  };
  const startedAt = Date.now();

  try {
    const result = await provider.generateStructured(request, contract);
    await appendOnboardingResponse(input.userMessageId, result.output, result);
    logOnboardingModelEvent({
      provider: result.provider,
      model: result.model,
      mode: result.output.mode,
      userTurnCount: userMessages.length,
      readyForSynthesis: result.output.readiness.readyForSynthesis,
      latencyMs: result.latencyMs,
      totalTurnLatencyMs: Date.now() - startedAt,
      success: true,
      repaired: result.repaired,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      reasoningEffort: provider.reasoningEffort ?? "provider_default",
    });
    return result.output;
  } catch (error) {
    logOnboardingModelEvent({
      provider: provider.provider,
      model: provider.model,
      userTurnCount: userMessages.length,
      latencyMs: Date.now() - startedAt,
      success: false,
      errorCode: error instanceof Error ? error.name : "UnknownOnboardingError",
      reasoningEffort: provider.reasoningEffort ?? "provider_default",
    });
    throw error;
  }
}

function logOnboardingModelEvent(
  event: Record<string, string | number | boolean | null>,
) {
  // Never log conversation content, structured understanding, or hidden reasoning.
  console.info("clarity_onboarding_model_request", event);
}
