export type ActionInputClassification =
  | "actionable"
  | "ambiguous"
  | "user_unsure"
  | "invalid";

export type ActionInputValidationInput = {
  title: string;
  clarificationQuestion?: string;
  clarificationAnswer?: string;
  context?: string;
  planFocus: string | null;
  helpRequested?: boolean;
};

export type ActionInputValidationResult =
  | {
      classification: "actionable";
      normalizedTitle: string;
    }
  | {
      classification: "ambiguous";
      clarification: string | null;
      exhausted: boolean;
    }
  | {
      classification: "user_unsure";
      message: string;
    }
  | {
      classification: "invalid";
      message: string;
    };

export interface ActionInputValidator {
  validate(
    input: ActionInputValidationInput,
  ): Promise<ActionInputValidationResult>;
}
