import {
  clarityConversationResponseJsonSchema,
  clarityConversationResponseSchema,
  type ClarityConversationResponse,
} from "./clarity-response-schema.ts";

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
};

export type ClarityProviderRequest = {
  systemPrompt: string;
  userPrompt: string;
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
}

export class ClarityProviderError extends Error {
  readonly code:
    | "configuration"
    | "timeout"
    | "provider_failure"
    | "invalid_output";

  constructor(
    message: string,
    code:
      | "configuration"
      | "timeout"
      | "provider_failure"
      | "invalid_output",
  ) {
    super(message);
    this.name = "ClarityProviderError";
    this.code = code;
  }
}

type FetchLike = typeof fetch;

type OpenAIResponse = {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
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
    const startedAt = Date.now();
    let repairInstruction: string | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.requestStructuredResponse(
        request,
        repairInstruction,
      );
      const text = extractOpenAIText(raw);
      const parsed = parseStructuredResponse(text);

      if (parsed) {
        return {
          output: parsed,
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

      repairInstruction =
        "Your prior output was not valid against the required JSON schema. Return only a corrected structured response. Do not add commentary or hidden reasoning.";
    }

    throw new ClarityProviderError(
      "The model returned an invalid structured response.",
      "invalid_output",
    );
  }

  private async requestStructuredResponse(
    request: ClarityProviderRequest,
    repairInstruction: string | null,
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
          max_output_tokens: 2_500,
          ...(this.reasoningEffort
            ? { reasoning: { effort: this.reasoningEffort } }
            : {}),
          input: [
            { role: "system", content: request.systemPrompt },
            {
              role: "user",
              content: repairInstruction
                ? `${request.userPrompt}\n\n${repairInstruction}`
                : request.userPrompt,
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "clarity_conversation_response",
              strict: true,
              schema: clarityConversationResponseJsonSchema,
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

function extractOpenAIText(response: OpenAIResponse) {
  if (typeof response.output_text === "string") return response.output_text;

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text ?? "")
    .join("");
}

function parseStructuredResponse(value: string) {
  try {
    return clarityConversationResponseSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

export function parseClarityProviderTimeout(value: string | undefined) {
  const parsed = Number(value ?? "30000");
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 120_000
    ? parsed
    : 30_000;
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
