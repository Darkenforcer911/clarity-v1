import "server-only";

import {
  createClarityStructuredProvider,
} from "./ai/clarity-provider-server";
import { prepareClarityMessageForReasoning } from "./ai/clarity-attachment-service";
import type {
  ClarityProviderRequest,
  ClarityStructuredProviderResult,
  ClarityStructuredProviderTimingEvent,
  ClarityStructuredOutputContract,
  OpenAIClarityProvider,
} from "./ai/clarity-provider";
import { runClarityTurnSingleFlight } from "./ai/clarity-turn-single-flight";
import {
  ONBOARDING_MINIMUM_MEANINGFUL_TURNS,
  ONBOARDING_SOFT_QUESTION_CAP,
  onboardingIntelligenceResponseSchema,
  type OnboardingIntelligenceResponse,
} from "./onboarding-intelligence";
import {
  appendOnboardingResponse,
  loadOnboardingTurnContext,
  type OnboardingPageState,
} from "./onboarding-service";
import {
  buildOnboardingSystemPrompt,
  buildOnboardingSynthesisSystemPrompt,
  buildOnboardingSynthesisUserPrompt,
  buildOnboardingUserPrompt,
} from "./onboarding-prompt";
import {
  composeOnboardingTurnResponse,
  mergeOnboardingDiscoveryState,
  onboardingDiscoveryResponseJsonSchema,
  onboardingDiscoveryResponseSchema,
  onboardingFinalSynthesisResponseJsonSchema,
  onboardingFinalSynthesisResponseSchema,
  validateOnboardingReadiness,
  type OnboardingCanonicalState,
  type OnboardingDiscoveryResponse,
  type OnboardingFinalSynthesisResponse,
} from "./onboarding-state-delta";
import {
  buildOnboardingQuestionPolicy,
  seedUserIntroducedUnknowns,
  validateOnboardingQuestionSelection,
} from "./onboarding-question-policy";

type OnboardingStructuredProvider = Pick<
  OpenAIClarityProvider,
  "provider" | "model" | "reasoningEffort" | "generateStructured"
>;

const ONBOARDING_MODEL_TIMEOUT_FLOOR_MS = 60_000;
const onboardingPerformanceLoggingEnabled =
  process.env.NODE_ENV !== "production";

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
  const turnStartedAt = performance.now();
  const phaseTimings = {
    contextLoadingMs: 0,
    sessionMessagesLoadingMs: 0,
    attachmentResolutionMs: 0,
    attachmentPreparationMs: 0,
    promptConstructionMs: 0,
    providerTotalMs: 0,
    discoveryProviderMs: 0,
    synthesisProviderMs: 0,
    persistenceMs: 0,
  };
  const providerTimings: ClarityStructuredProviderTimingEvent[] = [];

  const contextStartedAt = performance.now();
  const context = await loadOnboardingTurnContext(input.userMessageId, {
    ...(onboardingPerformanceLoggingEnabled
      ? {
          onTiming: (event) => {
            if (event.phase === "session_messages") {
              phaseTimings.sessionMessagesLoadingMs += event.durationMs;
            } else {
              phaseTimings.attachmentResolutionMs += event.durationMs;
            }
          },
        }
      : {}),
  });
  phaseTimings.contextLoadingMs = performance.now() - contextStartedAt;
  if (context.alreadyAnswered) return null;

  const promptStartedAt = performance.now();
  const userMessages = context.state.messages.filter(
    (message) => message.role === "user",
  );
  phaseTimings.promptConstructionMs += performance.now() - promptStartedAt;

  const attachmentStartedAt = performance.now();
  const prepared = await prepareClarityMessageForReasoning({
    content: context.userMessage.content,
    attachments: context.userMessage.attachments,
  });
  phaseTimings.attachmentPreparationMs =
    performance.now() - attachmentStartedAt;

  const remainingPromptStartedAt = performance.now();
  const promptMessages = context.state.messages.map((message) =>
    message.id === context.userMessage.id
      ? { ...message, content: prepared.userMessage }
      : message,
  );
  const assistantQuestionCount = context.state.messages.filter(
    (message) => message.role === "clarity" && message.content.includes("?"),
  ).length;
  const allowedMessageIds = new Set(userMessages.map((message) => message.id));
  const latestOutput = latestOnboardingOutput(context.state);
  const canonicalState = seedUserIntroducedUnknowns({
    state: canonicalStateFromContext(context.state, latestOutput),
    latestUserMessage: context.userMessage.content,
    previousFocus: latestOutput?.questionFocus ?? null,
  });
  const questionPolicy = buildOnboardingQuestionPolicy({
    state: canonicalState,
    messages: promptMessages,
    previousFocus: latestOutput?.questionFocus ?? null,
  });
  const discoveryContract: ClarityStructuredOutputContract<OnboardingDiscoveryResponse> = {
    name: "clarity_onboarding_discovery_delta",
    schema: onboardingDiscoveryResponseJsonSchema as unknown as Record<
      string,
      unknown
    >,
    maxOutputTokens: 2_000,
    ...(onboardingPerformanceLoggingEnabled
      ? {
          onTiming: (event: ClarityStructuredProviderTimingEvent) => {
            providerTimings.push(event);
          },
        }
      : {}),
    parse: (value) => {
      const parsed = onboardingDiscoveryResponseSchema.parse(value);
      validateOnboardingQuestionSelection({
        discovery: parsed,
        state: canonicalState,
        policy: questionPolicy,
      });
      const merged = mergeOnboardingDiscoveryState({
        state: canonicalState,
        discovery: parsed,
        allowedMessageIds,
      });
      validateOnboardingReadiness({ discovery: parsed, state: merged });
      const earlySynthesis =
        parsed.readiness.readyToSynthesize &&
        userMessages.length < ONBOARDING_MINIMUM_MEANINGFUL_TURNS &&
        !(
          userMessages.length === 1 &&
          parsed.readiness.personReady &&
          parsed.readiness.actionReady &&
          merged.progress.situation === "clear" &&
          merged.progress.whatMatters === "clear" &&
          merged.progress.constraints !== "learning"
        );
      if (earlySynthesis) {
        throw new Error("Onboarding synthesis is premature.");
      }
      if (
        assistantQuestionCount >= ONBOARDING_SOFT_QUESTION_CAP &&
        !parsed.readiness.readyToSynthesize
      ) {
        throw new Error(
          "Onboarding reached the soft question cap and must synthesize with explicit unknowns.",
        );
      }
      return parsed;
    },
  };
  const provider =
    input.provider ??
    createClarityStructuredProvider({
      minimumTimeoutMs: ONBOARDING_MODEL_TIMEOUT_FLOOR_MS,
    });
  const discoveryRequest: ClarityProviderRequest = {
    systemPrompt: buildOnboardingSystemPrompt(),
    userPrompt: buildOnboardingUserPrompt({
      messages: promptMessages,
      state: canonicalState,
      questionPolicy,
      userTurnCount: userMessages.length,
      assistantQuestionCount,
      profile: context.state.profile,
    }),
    images: prepared.images,
  };
  phaseTimings.promptConstructionMs +=
    performance.now() - remainingPromptStartedAt;
  const startedAt = Date.now();

  try {
    const discoveryStartedAt = performance.now();
    const discoveryResult = await provider
      .generateStructured(discoveryRequest, discoveryContract)
      .finally(() => {
        phaseTimings.discoveryProviderMs =
          performance.now() - discoveryStartedAt;
        phaseTimings.providerTotalMs =
          phaseTimings.discoveryProviderMs + phaseTimings.synthesisProviderMs;
      });
    const mergedState = mergeOnboardingDiscoveryState({
      state: canonicalState,
      discovery: discoveryResult.output,
      allowedMessageIds,
    });

    let synthesisResult:
      | ClarityStructuredProviderResult<OnboardingFinalSynthesisResponse>
      | null = null;
    let synthesisRequest: ClarityProviderRequest | null = null;
    if (discoveryResult.output.readiness.readyToSynthesize) {
      const synthesisPromptStartedAt = performance.now();
      synthesisRequest = {
        systemPrompt: buildOnboardingSynthesisSystemPrompt(),
        userPrompt: buildOnboardingSynthesisUserPrompt({
          state: mergedState,
          messages: promptMessages,
          profile: context.state.profile,
        }),
        images: prepared.images,
      };
      phaseTimings.promptConstructionMs +=
        performance.now() - synthesisPromptStartedAt;
      const synthesisContract: ClarityStructuredOutputContract<OnboardingFinalSynthesisResponse> = {
        name: "clarity_onboarding_final_synthesis",
        schema: onboardingFinalSynthesisResponseJsonSchema as unknown as Record<
          string,
          unknown
        >,
        maxOutputTokens: 3_500,
        ...(onboardingPerformanceLoggingEnabled
          ? {
              onTiming: (event: ClarityStructuredProviderTimingEvent) => {
                providerTimings.push(event);
              },
            }
          : {}),
        parse: (value) => onboardingFinalSynthesisResponseSchema.parse(value),
      };
      const synthesisStartedAt = performance.now();
      synthesisResult = await provider
        .generateStructured(synthesisRequest, synthesisContract)
        .finally(() => {
          phaseTimings.synthesisProviderMs =
            performance.now() - synthesisStartedAt;
          phaseTimings.providerTotalMs =
            phaseTimings.discoveryProviderMs + phaseTimings.synthesisProviderMs;
        });
    }

    const output = composeOnboardingTurnResponse({
      discovery: discoveryResult.output,
      state: mergedState,
      synthesis: synthesisResult?.output ?? null,
      allowedMessageIds,
    });
    const result = combineProviderResults({
      discovery: discoveryResult,
      synthesis: synthesisResult,
      output,
    });
    const persistenceStartedAt = performance.now();
    await appendOnboardingResponse(input.userMessageId, output, result);
    phaseTimings.persistenceMs = performance.now() - persistenceStartedAt;
    logOnboardingPerformanceProfile({
      phaseTimings,
      providerTimings,
      totalDurationMs: performance.now() - turnStartedAt,
      requestedMode: "ADAPTIVE",
      returnedMode: output.mode,
      inputMessageCount: promptMessages.length,
      userTurnCount: userMessages.length,
      systemPromptCharacters:
        discoveryRequest.systemPrompt.length +
        (synthesisRequest?.systemPrompt.length ?? 0),
      userPromptCharacters:
        discoveryRequest.userPrompt.length +
        (synthesisRequest?.userPrompt.length ?? 0),
      schemaCharacters:
        JSON.stringify(discoveryContract.schema).length +
        (synthesisResult
          ? JSON.stringify(onboardingFinalSynthesisResponseJsonSchema).length
          : 0),
      outputCharacters:
        JSON.stringify(discoveryResult.output).length +
        (synthesisResult ? JSON.stringify(synthesisResult.output).length : 0),
      persistedOutputCharacters: JSON.stringify(output).length,
      discoveryOutputCharacters: JSON.stringify(discoveryResult.output).length,
      synthesisOutputCharacters: synthesisResult
        ? JSON.stringify(synthesisResult.output).length
        : 0,
      questionFocusDomain:
        discoveryResult.output.questionFocus?.domain ?? null,
      latestUserResponseWasNonAnswer:
        questionPolicy.latestUserResponseWasNonAnswer,
      discoveryDeltaOperationCount: countDiscoveryDeltaOperations(
        discoveryResult.output,
      ),
      imageCount: prepared.images.length,
      repaired: result.repaired,
      success: true,
    });
    logOnboardingModelEvent({
      provider: result.provider,
      model: result.model,
      mode: output.mode,
      userTurnCount: userMessages.length,
      readyForSynthesis: output.readiness.readyForSynthesis,
      latencyMs: result.latencyMs,
      totalTurnLatencyMs: Date.now() - startedAt,
      success: true,
      repaired: result.repaired,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      reasoningEffort: provider.reasoningEffort ?? "provider_default",
      questionFocusDomain: output.questionFocus?.domain ?? "none",
    });
    return output;
  } catch (error) {
    logOnboardingPerformanceProfile({
      phaseTimings,
      providerTimings,
      totalDurationMs: performance.now() - turnStartedAt,
      requestedMode: "ADAPTIVE",
      inputMessageCount: promptMessages.length,
      userTurnCount: userMessages.length,
      systemPromptCharacters: discoveryRequest.systemPrompt.length,
      userPromptCharacters: discoveryRequest.userPrompt.length,
      schemaCharacters: JSON.stringify(discoveryContract.schema).length,
      imageCount: prepared.images.length,
      success: false,
      errorCode: error instanceof Error ? error.name : "UnknownOnboardingError",
    });
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

function canonicalStateFromContext(
  state: OnboardingPageState,
  latestArtifacts: OnboardingIntelligenceResponse | null,
): OnboardingCanonicalState {
  return {
    understanding: state.understanding,
    progress: state.progress,
    unknowns: latestArtifacts?.unknowns ?? [],
    insights: latestArtifacts?.insights ?? [],
    routes: latestArtifacts?.routes ?? [],
    synthesis: state.synthesis,
  };
}

function latestOnboardingOutput(
  state: OnboardingPageState,
): OnboardingIntelligenceResponse | null {
  const latest = [...state.messages]
    .reverse()
    .filter((message) => message.role === "clarity")
    .map((message) =>
      onboardingIntelligenceResponseSchema.safeParse(message.structured_output),
    )
    .find((result) => result.success);
  return latest?.data ?? null;
}

function combineProviderResults(input: {
  discovery: ClarityStructuredProviderResult<OnboardingDiscoveryResponse>;
  synthesis: ClarityStructuredProviderResult<OnboardingFinalSynthesisResponse> | null;
  output: OnboardingIntelligenceResponse;
}): ClarityStructuredProviderResult<OnboardingIntelligenceResponse> {
  const results = input.synthesis
    ? [input.discovery, input.synthesis]
    : [input.discovery];
  const sumUsage = (key: "inputTokens" | "outputTokens") =>
    results.every((result) => result.usage[key] !== null)
      ? results.reduce((total, result) => total + (result.usage[key] ?? 0), 0)
      : null;
  const finalResult = input.synthesis ?? input.discovery;

  return {
    output: input.output,
    provider: finalResult.provider,
    model: finalResult.model,
    latencyMs: results.reduce((total, result) => total + result.latencyMs, 0),
    usage: {
      inputTokens: sumUsage("inputTokens"),
      outputTokens: sumUsage("outputTokens"),
    },
    repaired: results.some((result) => result.repaired),
  };
}

function logOnboardingPerformanceProfile(input: {
  phaseTimings: {
    contextLoadingMs: number;
    sessionMessagesLoadingMs: number;
    attachmentResolutionMs: number;
    attachmentPreparationMs: number;
    promptConstructionMs: number;
    providerTotalMs: number;
    discoveryProviderMs: number;
    synthesisProviderMs: number;
    persistenceMs: number;
  };
  providerTimings: ClarityStructuredProviderTimingEvent[];
  totalDurationMs: number;
  requestedMode: string;
  returnedMode?: string;
  inputMessageCount: number;
  userTurnCount: number;
  systemPromptCharacters: number;
  userPromptCharacters: number;
  schemaCharacters: number;
  outputCharacters?: number;
  persistedOutputCharacters?: number;
  discoveryOutputCharacters?: number;
  synthesisOutputCharacters?: number;
  questionFocusDomain?: string | null;
  latestUserResponseWasNonAnswer?: boolean;
  discoveryDeltaOperationCount?: number;
  imageCount: number;
  repaired?: boolean;
  success: boolean;
  errorCode?: string;
}) {
  if (!onboardingPerformanceLoggingEnabled) return;

  const providerRequestMs = input.providerTimings
    .filter((event) => event.phase === "provider_request")
    .reduce((total, event) => total + event.durationMs, 0);
  const structuredParsingMs = input.providerTimings
    .filter((event) => event.phase === "structured_parse")
    .reduce((total, event) => total + event.durationMs, 0);
  const repairAttemptMs = input.providerTimings
    .filter((event) => event.repairAttempt)
    .reduce((total, event) => total + event.durationMs, 0);

  // Counts and timings only: never log prompts, messages, output, or hidden reasoning.
  console.info("clarity_onboarding_turn_profile", {
    ...Object.fromEntries(
      Object.entries(input.phaseTimings).map(([key, value]) => [
        key,
        Math.round(value),
      ]),
    ),
    providerRequestMs: Math.round(providerRequestMs),
    structuredParsingMs: Math.round(structuredParsingMs),
    repairAttemptMs: Math.round(repairAttemptMs),
    providerAttemptCount: input.providerTimings.filter(
      (event) => event.phase === "provider_request",
    ).length,
    totalDurationMs: Math.round(input.totalDurationMs),
    requestedMode: input.requestedMode,
    returnedMode: input.returnedMode ?? null,
    inputMessageCount: input.inputMessageCount,
    userTurnCount: input.userTurnCount,
    systemPromptCharacters: input.systemPromptCharacters,
    userPromptCharacters: input.userPromptCharacters,
    schemaCharacters: input.schemaCharacters,
    outputCharacters: input.outputCharacters ?? null,
    persistedOutputCharacters: input.persistedOutputCharacters ?? null,
    discoveryOutputCharacters: input.discoveryOutputCharacters ?? null,
    synthesisOutputCharacters: input.synthesisOutputCharacters ?? null,
    questionFocusDomain: input.questionFocusDomain ?? null,
    latestUserResponseWasNonAnswer:
      input.latestUserResponseWasNonAnswer ?? null,
    discoveryDeltaOperationCount:
      input.discoveryDeltaOperationCount ?? null,
    imageCount: input.imageCount,
    repaired: input.repaired ?? false,
    success: input.success,
    errorCode: input.errorCode ?? null,
  });
}

function countDiscoveryDeltaOperations(
  discovery: OnboardingDiscoveryResponse,
) {
  return Object.values(discovery.stateDelta).reduce(
    (total, operations) => total + operations.length,
    0,
  );
}

function logOnboardingModelEvent(
  event: Record<string, string | number | boolean | null>,
) {
  // Never log conversation content, structured understanding, or hidden reasoning.
  console.info("clarity_onboarding_model_request", event);
}
