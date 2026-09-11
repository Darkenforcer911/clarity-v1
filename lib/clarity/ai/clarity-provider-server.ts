import "server-only";

import {
  ClarityProviderError,
  OpenAIClarityProvider,
  parseClarityProviderTimeout,
  parseClarityReasoningEffort,
  type ClarityModelProvider,
} from "./clarity-provider";

export function createClarityModelProvider(): ClarityModelProvider {
  return createConfiguredOpenAIProvider();
}

export function createClarityStructuredProvider() {
  return createConfiguredOpenAIProvider();
}

function createConfiguredOpenAIProvider() {
  const provider = process.env.CLARITY_MODEL_PROVIDER ?? "openai";
  if (provider !== "openai") {
    throw new ClarityProviderError(
      `Unsupported Clarity model provider: ${provider}`,
      "configuration",
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.CLARITY_MODEL;
  if (!apiKey || !model) {
    throw new ClarityProviderError(
      "Clarity model configuration is incomplete.",
      "configuration",
    );
  }

  return new OpenAIClarityProvider(
    model,
    apiKey,
    parseClarityProviderTimeout(process.env.CLARITY_MODEL_TIMEOUT_MS),
    fetch,
    parseClarityReasoningEffort(process.env.CLARITY_REASONING_EFFORT),
  );
}
