import type { BuiltMentorLifeProposal } from "../life-model-proposal";
import type {
  ClarityContextBundle,
  ClarityExternalResearchRequest,
  ClarityInvocationSurface,
  ClarityPersonalContextDomain,
} from "./clarity-context";
import type {
  ClarityOpportunityEvaluation,
  ClarityScenarioForecast,
} from "./opportunity-analysis";
import { CLARITY_REASONING_POLICY } from "./reasoning-policy.ts";

export const clarityNextMoveTypes = [
  "ask",
  "clarify",
  "research",
  "explore",
  "recommend",
  "propose_action",
  "propose_life_change",
  "synthesize",
  "confirm",
] as const;

export type ClarityNextMoveType = (typeof clarityNextMoveTypes)[number];

type ClarityNextMoveBase = {
  type: ClarityNextMoveType;
  decisionSummary: string;
};

export type ClarityNextMove =
  | (ClarityNextMoveBase & {
      type: "ask" | "clarify";
      question: string;
    })
  | (ClarityNextMoveBase & {
      type: "research";
      request: ClarityExternalResearchRequest;
    })
  | (ClarityNextMoveBase & {
      type: "explore";
      opportunity: ClarityOpportunityEvaluation;
    })
  | (ClarityNextMoveBase & {
      type: "recommend";
      recommendation: string;
      scenario: ClarityScenarioForecast | null;
    })
  | (ClarityNextMoveBase & {
      type: "propose_action";
      proposal: ClarityActionProposal;
    })
  | (ClarityNextMoveBase & {
      type: "propose_life_change";
      proposal: BuiltMentorLifeProposal;
    })
  | (ClarityNextMoveBase & {
      type: "synthesize";
      synthesis: string;
    })
  | (ClarityNextMoveBase & {
      type: "confirm";
      confirmationPrompt: string;
      proposalIds: string[];
    });

export type ClarityActionProposal = {
  title: string;
  scheduledTime: string | null;
  estimatedMinutes: number;
  whyItMatters: string;
};

export const clarityConfirmationRequiredMutationKinds = [
  "action",
  "life_model",
  "current_direction",
  "calendar_commitment",
] as const;

export type ClarityConfirmationRequiredMutationKind =
  (typeof clarityConfirmationRequiredMutationKinds)[number];

export type ClarityMutationProposal = {
  id: string;
  kind: ClarityConfirmationRequiredMutationKind;
  summary: string;
  requiresUserConfirmation: true;
  payload: unknown;
};

export type ClarityOrchestratorRequest = {
  surface: ClarityInvocationSurface;
  userInput: string;
  context: ClarityContextBundle;
};

export type ClarityOrchestratorResult = {
  userFacingMessage: string;
  nextMove: ClarityNextMove;
  additionalContextRequired: ClarityPersonalContextDomain[];
  mutationProposals: ClarityMutationProposal[];
};

/**
 * Provider-neutral contract only. Implementations must use the shared policy,
 * return proposals rather than applying mutations, and must not expose or
 * persist hidden chain-of-thought.
 */
export interface ClarityOrchestrator {
  readonly reasoningPolicy: typeof CLARITY_REASONING_POLICY;
  decideNextMove(
    request: ClarityOrchestratorRequest,
  ): Promise<ClarityOrchestratorResult>;
}
