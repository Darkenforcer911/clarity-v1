import type { GeneratedPlan } from "../schemas";

export type ClarityAIInput = {
  userId: string;
  localDate: string;
  timezone: string;
  wokeAt: string;
  aimingToSleepAt: string;
  contextForToday: string | null;
};

export interface ClarityAI {
  buildPlan(input: ClarityAIInput): Promise<GeneratedPlan>;
}
