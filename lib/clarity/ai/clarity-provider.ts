import {
  clarityConversationResponseJsonSchema,
  clarityConversationResponseSchema,
  type ClarityConversationResponse,
} from "./clarity-response-schema.ts";
import {
  ClarityStructuredValidationError,
  type ClaritySafeDiagnosticMetadata,
  type ClarityStructuredRejection,
  type ClarityStructuredRejectionStage,
} from "./clarity-structured-diagnostics.ts";
import {
  extractClarityResearchMetadata,
  selectClarityResearchSources,
  type ClarityResearchMetadata,
} from "./clarity-research.ts";
import { z } from "zod";

export type ClarityProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ClarityProviderResult = {
  output: ClarityConversationResponse;
  provider: string;
  model: string;
  latencyMs: number;
  usage: ClarityProviderUsage;
  repaired: boolean;
  research?: ClarityResearchMetadata;
};

export type ClarityStructuredProviderResult<Output> = Omit<
  ClarityProviderResult,
  "output" | "research"
> & {
  output: Output;
};

export type ClarityStructuredOutputContract<Output> = {
  name: string;
  schema: Record<string, unknown>;
  parse: (value: unknown) => Output;
  maxOutputTokens?: number;
  onTiming?: (event: ClarityStructuredProviderTimingEvent) => void;
};

export type ClarityStructuredProviderTimingEvent = {
  phase: "provider_request" | "structured_parse";
  contractName: string;
  attempt: number;
  repairAttempt: boolean;
  durationMs: number;
  success: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  outputCharacters: number | null;
  providerStatus: string | null;
  finishReason: string | null;
  rejectionStage: ClarityStructuredRejectionStage | null;
  rejectionCode: string | null;
  safeMetadata: ClaritySafeDiagnosticMetadata;
};

export type ClarityStructuredParseResult<Output> =
  | { ok: true; value: Output }
  | { ok: false; rejection: ClarityStructuredRejection };

export type ClarityProviderRequest = {
  systemPrompt: string;
  userPrompt: string;
  images?: ClarityProviderImage[];
};

export type ClarityProviderImage = {
  mimeType: string;
  base64Data: string;
};

export type ClarityResearchLocation = {
  city: string | null;
  countryCode: string | null;
  timezone: string;
};

export type ClarityProviderResearchRequest = ClarityProviderRequest & {
  userLocation: ClarityResearchLocation;
};

export const clarityReasoningEfforts = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ClarityReasoningEffort = typeof clarityReasoningEfforts[number];

export interface ClarityModelProvider {
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort?: ClarityReasoningEffort | null;
  generate(request: ClarityProviderRequest): Promise<ClarityProviderResult>;
  research(
    request: ClarityProviderResearchRequest,
  ): Promise<ClarityProviderResult>;
}

export class ClarityProviderError extends Error {
  readonly code:
    | "configuration"
    | "timeout"
    | "provider_failure"
    | "invalid_output"
    | "research_failure";

  constructor(
    message: string,
    code:
      | "configuration"
      | "timeout"
      | "provider_failure"
      | "invalid_output"
      | "research_failure",
  ) {
    super(message);
    this.name = "ClarityProviderError";
    this.code = code;
  }
}

type FetchLike = typeof fetch;

type OpenAIResponse = {
  output_text?: unknown;
  status?: unknown;
  incomplete_details?: { reason?: unknown } | null;
  output?: Array<{
    type?: string;
    status?: string;
    action?: { sources?: unknown };
    content?: Array<{ type?: string; text?: string; annotations?: unknown }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string };
};

export class OpenAIClarityProvider implements ClarityModelProvider {
  readonly provider = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;
  readonly reasoningEffort: ClarityReasoningEffort | null;

  constructor(
    model: string,
    apiKey: string,
    timeoutMs = 30_000,
    fetcher: FetchLike = fetch,
    reasoningEffort: ClarityReasoningEffort | null = null,
  ) {
    this.model = model;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetcher = fetcher;
    this.reasoningEffort = reasoningEffort;
  }

  async generate(
    request: ClarityProviderRequest,
  ): Promise<ClarityProviderResult> {
    return this.generateStructured(request, {
      name: "clarity_conversation_response",
      schema: clarityConversationResponseJsonSchema,
      parse: (value) => clarityConversationResponseSchema.parse(value),
    });
  }

  async generateStructured<Output>(
    request: ClarityProviderRequest,
    contract: ClarityStructuredOutputContract<Output>,
  ): Promise<ClarityStructuredProviderResult<Output>> {
    const startedAt = Date.now();
    let repairInstruction: string | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const providerRequestStartedAt = performance.now();
      let raw: OpenAIResponse;
      try {
        raw = await this.requestStructuredResponse(
          request,
          repairInstruction,
          null,
          contract.name,
          contract.schema,
          contract.maxOutputTokens,
        );
        const text = extractOpenAIText(raw);
        emitStructuredTiming(contract, {
          phase: "provider_request",
          contractName: contract.name,
          attempt: attempt + 1,
          repairAttempt: attempt === 1,
          durationMs: performance.now() - providerRequestStartedAt,
          success: true,
          ...structuredResponseMetadata(raw, text.length),
          rejectionStage: null,
          rejectionCode: null,
          safeMetadata: {},
        });
      } catch (error) {
        emitStructuredTiming(contract, {
          phase: "provider_request",
          contractName: contract.name,
          attempt: attempt + 1,
          repairAttempt: attempt === 1,
          durationMs: performance.now() - providerRequestStartedAt,
          success: false,
          inputTokens: null,
          outputTokens: null,
          outputCharacters: null,
          providerStatus: null,
          finishReason: null,
          rejectionStage: null,
          rejectionCode:
            error instanceof ClarityProviderError ? error.code : "unknown",
          safeMetadata: {},
        });
        throw error;
      }

      const parseStartedAt = performance.now();
      const text = extractOpenAIText(raw);
      const parsed = parseStructuredResponse(text, contract.parse);
      emitStructuredTiming(contract, {
        phase: "structured_parse",
        contractName: contract.name,
        attempt: attempt + 1,
        repairAttempt: attempt === 1,
        durationMs: performance.now() - parseStartedAt,
        success: parsed.ok,
        ...structuredResponseMetadata(raw, text.length),
        rejectionStage: parsed.ok ? null : parsed.rejection.stage,
        rejectionCode: parsed.ok ? null : parsed.rejection.code,
        safeMetadata: parsed.ok ? {} : parsed.rejection.safeMetadata,
      });

      if (parsed.ok) {
        return {
          output: parsed.value,
          provider: this.provider,
          model: this.model,
          latencyMs: Date.now() - startedAt,
          usage: {
            inputTokens: integerOrNull(raw.usage?.input_tokens),
            outputTokens: integerOrNull(raw.usage?.output_tokens),
          },
          repaired: attempt === 1,
        };
      }

      repairInstruction = buildStructuredRepairInstruction(parsed.rejection);
    }

    throw new ClarityProviderError(
      "The model returned an invalid structured response.",
      "invalid_output",
    );
  }

  async research(
    request: ClarityProviderResearchRequest,
  ): Promise<ClarityProviderResult> {
    const startedAt = Date.now();

    try {
      const raw = await this.requestStructuredResponse(
        request,
        null,
        request.userLocation,
        "clarity_conversation_response",
        clarityConversationResponseJsonSchema,
      );
      const parsed = parseStructuredResponse(
        extractOpenAIText(raw),
        (value) => clarityConversationResponseSchema.parse(value),
      );
      const research = extractClarityResearchMetadata(raw, {
        retrievedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      });
      if (!parsed.ok || research.toolCallCount < 1 || research.sourceCount < 1) {
        throw new ClarityProviderError(
          "Current research did not return a usable answer.",
          "research_failure",
        );
      }
      const researchSources = selectClarityResearchSources(
        research.sources,
        true,
      );
      return {
        output: parsed.value,
        provider: this.provider,
        model: this.model,
        latencyMs: Date.now() - startedAt,
        usage: {
          inputTokens: integerOrNull(raw.usage?.input_tokens),
          outputTokens: integerOrNull(raw.usage?.output_tokens),
        },
        repaired: false,
        research: {
          ...research,
          sources: researchSources,
          sourceCount: researchSources.length,
          latencyMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      if (
        error instanceof ClarityProviderError &&
        error.code === "configuration"
      ) {
        throw error;
      }
      throw new ClarityProviderError(
        "Current research could not be completed.",
        "research_failure",
      );
    }
  }

  private async requestStructuredResponse(
    request: ClarityProviderRequest,
    repairInstruction: string | null,
    researchLocation: ClarityResearchLocation | null = null,
    outputName = "clarity_conversation_response",
    outputSchema: Record<string, unknown> = clarityConversationResponseJsonSchema,
    maxOutputTokens = 2_500,
  ): Promise<OpenAIResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          store: false,
          max_output_tokens: maxOutputTokens,
          ...(researchLocation
            ? {
                include: ["web_search_call.action.sources"],
                tools: [
                  {
                    type: "web_search_preview",
                    search_context_size: "medium",
                    user_location: approximateUserLocation(researchLocation),
                  },
                ],
                tool_choice: "required",
                max_tool_calls: 4,
              }
            : {}),
          ...(this.reasoningEffort
            ? { reasoning: { effort: this.reasoningEffort } }
            : {}),
          input: [
            { role: "system", content: request.systemPrompt },
            {
              role: "user",
              content: providerUserContent(
                repairInstruction
                  ? `${request.userPrompt}\n\n${repairInstruction}`
                  : request.userPrompt,
                request.images ?? [],
              ),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: outputName,
              strict: true,
              schema: outputSchema,
            },
          },
        }),
      });

      const payload = (await response.json()) as OpenAIResponse;
      if (!response.ok) {
        throw new ClarityProviderError(
          payload.error?.message ?? "The model provider rejected the request.",
          "provider_failure",
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof ClarityProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ClarityProviderError("The model request timed out.", "timeout");
      }
      throw new ClarityProviderError(
        "The model provider could not be reached.",
        "provider_failure",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

const genericStructuredRepairInstruction =
  "Your prior output was not valid against the required JSON schema. Return only a corrected structured response. Do not add commentary or hidden reasoning.";

export function buildStructuredRepairInstruction(
  rejection: ClarityStructuredRejection,
) {
  if (
    rejection.stage === "state_delta" &&
    rejection.code === "artifact_limit_exceeded" &&
    rejection.safeMetadata.operationType === "insight_add"
  ) {
    return `${genericStructuredRepairInstruction} The canonical onboarding insight collection has no additional slots remaining. Do not append another unique insight. Either update or replace an existing insight when the new evidence justifies it, or return no new insight delta.`;
  }

  return genericStructuredRepairInstruction;
}

function emitStructuredTiming<Output>(
  contract: ClarityStructuredOutputContract<Output>,
  event: ClarityStructuredProviderTimingEvent,
) {
  try {
    contract.onTiming?.(event);
  } catch {
    // Diagnostics must never affect provider behavior.
  }
}

function extractOpenAIText(response: OpenAIResponse) {
  if (typeof response.output_text === "string") return response.output_text;

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text ?? "")
    .join("");
}

export function parseStructuredResponse<Output>(
  value: string,
  parse: (value: unknown) => Output,
): ClarityStructuredParseResult<Output> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return {
      ok: false,
      rejection: {
        stage: "json_parse",
        code: "invalid_json",
        safeMetadata: {},
      },
    };
  }

  try {
    return { ok: true, value: parse(decoded) };
  } catch (error) {
    if (error instanceof ClarityStructuredValidationError) {
      return {
        ok: false,
        rejection: {
          stage: error.stage,
          code: error.code,
          safeMetadata: error.safeMetadata,
        },
      };
    }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        rejection: {
          stage: "schema_validation",
          code: "zod_validation_failed",
          safeMetadata: {
            issueCount: error.issues.length,
            issueCodes: [...new Set(error.issues.map((issue) => issue.code))],
            issuePaths: error.issues.map((issue) =>
              issue.path.length > 0 ? issue.path.join(".") : "$",
            ),
          },
        },
      };
    }
    return {
      ok: false,
      rejection: {
        stage: "other_internal_validation",
        code: error instanceof Error ? error.name : "unknown_error",
        safeMetadata: {},
      },
    };
  }
}

function structuredResponseMetadata(
  response: OpenAIResponse,
  outputCharacters: number,
) {
  return {
    inputTokens: integerOrNull(response.usage?.input_tokens),
    outputTokens: integerOrNull(response.usage?.output_tokens),
    outputCharacters,
    providerStatus:
      typeof response.status === "string" ? response.status : null,
    finishReason:
      typeof response.incomplete_details?.reason === "string"
        ? response.incomplete_details.reason
        : null,
  };
}

export function parseClarityProviderTimeout(
  value: string | undefined,
  minimumMs = 0,
) {
  const parsed = Number(value ?? "30000");
  const configured =
    Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 120_000
      ? parsed
      : 30_000;
  return Math.max(configured, minimumMs);
}

export function parseClarityReasoningEffort(
  value: string | undefined,
): ClarityReasoningEffort | null {
  return clarityReasoningEfforts.includes(value as ClarityReasoningEffort)
    ? (value as ClarityReasoningEffort)
    : null;
}

function integerOrNull(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function approximateUserLocation(location: ClarityResearchLocation) {
  return {
    type: "approximate" as const,
    ...(location.city ? { city: location.city } : {}),
    ...(location.countryCode ? { country: location.countryCode } : {}),
    timezone: location.timezone,
  };
}

function providerUserContent(
  userPrompt: string,
  images: ClarityProviderImage[],
) {
  if (images.length === 0) return userPrompt;
  return [
    { type: "input_text" as const, text: userPrompt },
    ...images.map((image) => ({
      type: "input_image" as const,
      detail: "auto" as const,
      image_url: `data:${image.mimeType};base64,${image.base64Data}`,
    })),
  ];
}
