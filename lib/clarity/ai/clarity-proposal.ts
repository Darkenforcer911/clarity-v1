import { z } from "zod";

import { addLocalDays, getLocalDate, getLocalTime } from "../date-time.ts";
import type { ClarityMemoryContext } from "./clarity-memory";
import {
  clarityActionCreateCandidateSchema,
  clarityActionRelativeDueAtPattern,
  clarityMemoryUpdateCandidateSchema,
  clarityProposalCandidateSchema,
  type ClarityActionCreateCandidate,
  type ClarityMemoryUpdateCandidate,
  type ClarityProposalCandidate,
} from "./clarity-response-schema.ts";

export const clarityProposalStatuses = [
  "proposed",
  "dismissed",
  "expired",
  "executed",
  "execution_failed",
] as const;

export const clarityMemoryUpdateProposalSchema = z
  .object({
    type: z.literal("memory_update"),
    id: z.string().uuid(),
    sourceAssistantMessageId: z.string().uuid(),
    status: z.enum(clarityProposalStatuses),
    summary: z.string(),
    rationale: z.string(),
    revision: z.number().int().positive(),
    confirmedAt: z.string().nullable(),
    dismissedAt: z.string().nullable(),
    expiredAt: z.string().nullable(),
    executedAt: z.string().nullable(),
    executionFailureCode: z.string().nullable(),
    dismissalReason: z.string().nullable(),
    targetMemoryItemId: z.string().uuid(),
    targetStatement: z.string(),
    replacementStatement: z.string(),
    effectiveOn: z.iso.date().nullable(),
    resultMemoryItemId: z.string().uuid().nullable(),
  })
  .strict();

export type ClarityMemoryUpdateProposal = z.infer<
  typeof clarityMemoryUpdateProposalSchema
>;

export const clarityActionCreateProposalSchema = z
  .object({
    type: z.literal("action_create"),
    id: z.string().uuid(),
    sourceAssistantMessageId: z.string().uuid(),
    status: z.enum(clarityProposalStatuses),
    summary: z.string(),
    rationale: z.string(),
    revision: z.number().int().positive(),
    confirmedAt: z.string().nullable(),
    dismissedAt: z.string().nullable(),
    expiredAt: z.string().nullable(),
    executedAt: z.string().nullable(),
    executionFailureCode: z.string().nullable(),
    dismissalReason: z.string().nullable(),
    title: z.string(),
    localDate: z.iso.date(),
    dueLocalDate: z.iso.date().nullable(),
    dueLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
    resultActionId: z.string().uuid().nullable(),
  })
  .strict();

export type ClarityActionCreateProposal = z.infer<
  typeof clarityActionCreateProposalSchema
>;

export type ClarityChangeProposal =
  | ClarityMemoryUpdateProposal
  | ClarityActionCreateProposal;

export type ClarityRecentDismissedProposal = {
  type: "memory_update";
  epistemicStatus: "dismissed_unconfirmed";
  sourceUserMessageId: string;
  summary: string;
  targetMemoryItemId: string;
  targetStatementAtProposal: string;
  replacementStatement: string;
  dismissedAt: string;
};

export type ClarityRecentDismissedActionProposal = {
  type: "action_create";
  epistemicStatus: "dismissed_unconfirmed";
  sourceUserMessageId: string;
  summary: string;
  title: string;
  localDate: string;
  dueLocalDate: string | null;
  dueLocalTime: string | null;
  dismissedAt: string;
};

export type ClarityProposalContext = {
  recentDismissedMemoryUpdates: ClarityRecentDismissedProposal[];
  recentDismissedActionCreates: ClarityRecentDismissedActionProposal[];
};

export type ValidatedClarityActionCreateCandidate =
  ClarityActionCreateCandidate & {
    actionLocalDate: string;
    dueLocalDate: string | null;
    dueLocalTime: string | null;
  };

export type ValidatedClarityProposalCandidate =
  | ClarityMemoryUpdateCandidate
  | ValidatedClarityActionCreateCandidate;

export class ClarityProposalCandidateError extends Error {
  constructor(message = "Clarity returned an unavailable proposal target.") {
    super(message);
    this.name = "ClarityProposalCandidateError";
  }
}

export function validateClarityMemoryUpdateCandidate(
  candidate: ClarityMemoryUpdateCandidate | null,
  memory: ClarityMemoryContext,
) {
  if (candidate === null) return null;
  const parsed = clarityMemoryUpdateCandidateSchema.parse(candidate);
  const suppliedTargets = [
    ...memory.currentState,
    ...memory.staleCurrentState,
  ];
  const target = suppliedTargets.find(
    (item) => item.id === parsed.targetMemoryItemId,
  );

  if (!target || target.memoryClass !== "current_state") {
    throw new ClarityProposalCandidateError();
  }
  if (
    target.statement.trim().toLowerCase() ===
    parsed.replacementStatement.trim().toLowerCase()
  ) {
    throw new ClarityProposalCandidateError(
      "Clarity returned a proposal that does not change Current State.",
    );
  }

  return parsed;
}

export function validateClarityActionCreateCandidate(
  candidate: ClarityActionCreateCandidate,
  context: {
    profile: { localDate: string; timezone: string };
  },
): ValidatedClarityActionCreateCandidate {
  const parsed = clarityActionCreateCandidateSchema.parse(candidate);
  const profileLocalToday = context.profile.localDate;
  const actionLocalDate = parsed.preferredDay ?? profileLocalToday;
  if (actionLocalDate < profileLocalToday) {
    throw new ClarityProposalCandidateError(
      "Clarity returned an Action date that has already passed.",
    );
  }

  let dueLocalDate: string | null = null;
  let dueLocalTime: string | null = null;
  if (parsed.dueAt) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed.dueAt)) {
      dueLocalDate = parsed.dueAt;
    } else if (clarityActionRelativeDueAtPattern.test(parsed.dueAt)) {
      const resolved = resolveClarityActionRelativeDueAt(
        parsed.dueAt,
        profileLocalToday,
      );
      dueLocalDate = resolved.localDate;
      dueLocalTime = resolved.localTime;
    } else {
      const dueAt = new Date(parsed.dueAt);
      if (Number.isNaN(dueAt.getTime())) {
        throw new ClarityProposalCandidateError(
          "Clarity returned an invalid Due date.",
        );
      }
      dueLocalDate = getLocalDate(context.profile.timezone, dueAt);
      dueLocalTime = getLocalTime(context.profile.timezone, dueAt);
    }
  }
  if (dueLocalDate && dueLocalDate < actionLocalDate) {
    throw new ClarityProposalCandidateError(
      "Clarity returned a Due date before the Action date.",
    );
  }

  return {
    ...parsed,
    actionLocalDate,
    dueLocalDate,
    dueLocalTime,
  };
}

const weekdayIndex = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const;

export function resolveClarityActionRelativeDueAt(
  dueAt: string,
  profileLocalToday: string,
) {
  if (!clarityActionRelativeDueAtPattern.test(dueAt)) {
    throw new ClarityProposalCandidateError(
      "Clarity returned an invalid relative Due date.",
    );
  }

  const [relativeDate, localTime = null] = dueAt.split("T");
  if (relativeDate === "today" || relativeDate === "tonight") {
    return { localDate: profileLocalToday, localTime };
  }
  if (relativeDate === "tomorrow") {
    return { localDate: addLocalDays(profileLocalToday, 1), localTime };
  }

  const match = /^(this|next)_(\w+)$/.exec(relativeDate);
  if (!match) {
    throw new ClarityProposalCandidateError(
      "Clarity returned an invalid relative Due date.",
    );
  }
  const [, relation, weekdayName] = match;
  const targetWeekday = weekdayIndex[weekdayName as keyof typeof weekdayIndex];
  const [year, month, day] = profileLocalToday.split("-").map(Number);
  const currentWeekday = new Date(
    Date.UTC(year, month - 1, day),
  ).getUTCDay();
  let daysAhead = (targetWeekday - currentWeekday + 7) % 7;
  if (relation === "next" && daysAhead === 0) daysAhead = 7;

  return {
    localDate: addLocalDays(profileLocalToday, daysAhead),
    localTime,
  };
}

export function validateClarityProposalCandidate(
  candidate: ClarityProposalCandidate | null,
  context: {
    memory: ClarityMemoryContext;
    profile: { localDate: string; timezone: string };
  },
): ValidatedClarityProposalCandidate | null {
  if (candidate === null) return null;
  const parsed = clarityProposalCandidateSchema.parse(candidate);
  if (parsed.type === "memory_update") {
    return validateClarityMemoryUpdateCandidate(parsed, context.memory);
  }
  return validateClarityActionCreateCandidate(parsed, context);
}

export function formatClarityProposalEffectiveDate(
  effectiveOn: string | null,
) {
  if (!effectiveOn) return null;
  const [year, month, day] = effectiveOn.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatClarityActionProposalDue(input: {
  dueLocalDate: string | null;
  dueLocalTime: string | null;
}) {
  if (!input.dueLocalDate) return null;
  const [year, month, day] = input.dueLocalDate.split("-").map(Number);
  const date = new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
  if (!input.dueLocalTime) return `Due ${date}`;
  const [hour, minute] = input.dueLocalTime.split(":").map(Number);
  const time = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
  return `Due ${date}, ${time.toLowerCase()}`;
}

export function clarityActionProposalPlacementCopy(
  dueLocalDate: string | null,
  profileLocalDate: string,
) {
  if (!dueLocalDate) {
    return { proposed: "Add Action?", executed: "Added" } as const;
  }
  if (dueLocalDate === profileLocalDate) {
    return { proposed: "Add to Today?", executed: "Added to Today" } as const;
  }
  if (dueLocalDate > profileLocalDate) {
    const [year, month, day] = dueLocalDate.split("-").map(Number);
    const weekday = new Intl.DateTimeFormat("en-AU", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
    return {
      proposed: "Add Action?",
      executed: `Added for ${weekday}`,
    } as const;
  }
  return { proposed: "Add Action?", executed: "Added" } as const;
}
