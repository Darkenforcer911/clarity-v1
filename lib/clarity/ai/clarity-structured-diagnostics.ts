export const clarityStructuredRejectionStages = [
  "json_parse",
  "schema_validation",
  "question_policy",
  "state_delta",
  "evidence_reference",
  "readiness",
  "synthesis_policy",
  "stopping_policy",
  "other_internal_validation",
] as const;

export type ClarityStructuredRejectionStage =
  (typeof clarityStructuredRejectionStages)[number];

export type ClaritySafeDiagnosticValue =
  | string
  | number
  | boolean
  | null
  | string[];

export type ClaritySafeDiagnosticMetadata = Record<
  string,
  ClaritySafeDiagnosticValue
>;

export type ClarityStructuredRejection = {
  stage: ClarityStructuredRejectionStage;
  code: string;
  safeMetadata: ClaritySafeDiagnosticMetadata;
};

export class ClarityStructuredValidationError extends Error {
  readonly stage: ClarityStructuredRejectionStage;
  readonly code: string;
  readonly safeMetadata: ClaritySafeDiagnosticMetadata;

  constructor(
    stage: ClarityStructuredRejectionStage,
    code: string,
    safeMetadata: ClaritySafeDiagnosticMetadata = {},
    message = `Structured output was rejected at ${stage}.`,
  ) {
    super(message);
    this.name = "ClarityStructuredValidationError";
    this.stage = stage;
    this.code = code;
    this.safeMetadata = safeMetadata;
  }
}

export function rejectClarityStructuredOutput(
  stage: ClarityStructuredRejectionStage,
  code: string,
  safeMetadata: ClaritySafeDiagnosticMetadata = {},
  message?: string,
): never {
  throw new ClarityStructuredValidationError(stage, code, safeMetadata, message);
}
