import type { CalendarCommitment } from "../calendar-commitments";
import type { DayCorrection } from "../day-corrections";
import type {
  DailyLoopData,
  PendingReturnGap,
  PreviousDayTransition,
  ReturnGapRecord,
} from "../daily-loop-queries";
import type { LifeModel } from "../life-model";
import type { AuthoritativeReturnState } from "../previous-day-routing";
import type { ClarityMemoryContext, ClarityMemorySource } from "./clarity-memory";
import type {
  ClarityActionInvocation,
  ClarityCalendarInvocation,
  ClarityDayInvocation,
} from "../clarity-action-context";

export const clarityInvocationSurfaces = [
  "clarity",
  "onboarding",
  "shape_today",
  "catch_up",
  "life_change",
  "weekly_review",
  "action_workspace",
] as const;

export type ClarityInvocationSurface =
  (typeof clarityInvocationSurfaces)[number];

export const clarityPersonalContextDomains = [
  "life",
  "today",
  "calendar",
  "return",
  "conversation_memory",
] as const;

export type ClarityPersonalContextDomain =
  (typeof clarityPersonalContextDomains)[number];

/** Reuses the confirmed canonical Life read model without creating a shadow profile. */
export type ClarityLifeContext = LifeModel;

/** Reuses current Daily Loop records while omitting the authenticated User object. */
export type ClarityTodayContext = Pick<
  DailyLoopData,
  | "profile"
  | "localDate"
  | "plan"
  | "actions"
  | "removedProposedActions"
  | "dayRecord"
  | "rescheduledContext"
  | "carriedActions"
  | "yesterdayRecord"
  | "previousPlan"
>;

export type ClarityReturnContext = {
  returnState: AuthoritativeReturnState;
  pendingReturnGap: PendingReturnGap | null;
  latestReturnGapRecord: ReturnGapRecord | null;
  previousDayTransition: PreviousDayTransition | null;
};

export type ClarityCalendarContext = {
  fromLocalDate: string;
  throughLocalDate: string;
  commitments: CalendarCommitment[];
  historicalCorrections: DayCorrection[];
};

export type ClarityVerifiedExternalFact = {
  claim: string;
  sourceUrl: string;
  verifiedAt: string;
  jurisdiction: string | null;
  effectiveOn: string | null;
};

export type ClarityExternalResearchRequest = {
  question: string;
  reason: string;
  jurisdiction: string | null;
  consequential: boolean;
};

export type ClarityVerifiedExternalContext = {
  request: ClarityExternalResearchRequest;
  facts: ClarityVerifiedExternalFact[];
};

export type ClarityContextBundle = {
  loadedDomains: ClarityPersonalContextDomain[];
  life?: ClarityLifeContext;
  today?: ClarityTodayContext;
  calendar?: ClarityCalendarContext;
  return?: ClarityReturnContext;
  memory?: ClarityMemoryContext;
  verifiedExternalWorld?: ClarityVerifiedExternalContext;
};

export type ClarityInvocationSubject =
  | ClarityActionInvocation
  | ClarityCalendarInvocation
  | ClarityDayInvocation;

export interface ClarityLifeContextSource {
  loadCanonicalLife(): Promise<ClarityLifeContext>;
}

export interface ClarityTodayContextSource {
  loadCurrentDailyLoop(): Promise<ClarityTodayContext>;
}

export interface ClarityReturnContextSource {
  loadReturnState(): Promise<ClarityReturnContext>;
}

export interface ClarityCalendarContextSource {
  loadCalendarRange(input: {
    fromLocalDate: string;
    throughLocalDate: string;
  }): Promise<ClarityCalendarContext>;
}

export interface ClarityExternalResearchSource {
  verify(
    request: ClarityExternalResearchRequest,
  ): Promise<ClarityVerifiedExternalContext>;
}

/** Every source is bound to the currently authenticated user. */
export type ClarityContextSources = {
  life: ClarityLifeContextSource;
  today: ClarityTodayContextSource;
  return: ClarityReturnContextSource;
  calendar: ClarityCalendarContextSource;
  memory: ClarityMemorySource;
  externalResearch: ClarityExternalResearchSource;
};
