import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/supabase/database.types";
import {
  getAuthenticatedUserAndProfile,
  type Profile,
} from "../daily-loop-queries";
import { addLocalDays, getLocalDate } from "../date-time";
import {
  parseCalendarCommitments,
  type CalendarCommitment,
} from "../calendar-commitments";
import {
  parseClarityInvocation,
  type ClarityInvocation,
} from "../clarity-action-context";
import { parseLifeModel, type LifeModel } from "../life-model";
import type { ClarityMemoryContext } from "./clarity-memory";
import { loadClarityMemoryContext } from "./clarity-memory-service";

const CONTEXT_LIMITS = {
  calendarPastDays: 2,
  calendarFutureDays: 7,
  recentRealityDays: 7,
  maxActions: 28,
  maxCommitments: 24,
  maxCorrections: 16,
  maxLifeAreas: 8,
  maxEvidencePerArea: 4,
} as const;

type RpcClient = SupabaseClient<Database>;
type ActionRow = Tables<"daily_actions">;
type CalendarRelationships = Pick<
  Tables<"calendar_commitments">,
  "life_area_id" | "goal_id" | "project_id" | "current_context_id"
>;

export type ClarityInvocationDescriptor = {
  type: "general" | "action" | "calendar_occurrence" | "day";
  actionId: string | null;
  calendarCommitmentId: string | null;
  localDate: string | null;
};

export type ClaritySubjectContext =
  | { kind: "action"; id: string; label: string; value: ActionRow }
  | {
      kind: "calendar_occurrence";
      id: string;
      label: string;
      localDate: string;
      value: CalendarCommitment;
      relationships: CalendarRelationships;
    }
  | { kind: "day"; id: string; label: string; localDate: string }
  | null;

export type ClarityAssembledContext = {
  profile: {
    name: string | null;
    timezone: string;
    dateOfBirth: string | null;
    age: number | null;
    city: string | null;
    country: string | null;
    localDate: string;
    localTime: string;
    truthState: "confirmed";
  };
  life: ReturnType<typeof selectLifeContext>;
  memory: ClarityMemoryContext;
  today: {
    plan: Tables<"daily_plans"> | null;
    actions: ActionRow[];
  };
  calendar: {
    fromLocalDate: string;
    throughLocalDate: string;
    commitments: CalendarCommitment[];
    actions: Array<ActionRow & { projections: Array<"scheduled" | "due"> }>;
  };
  recentReality: {
    actions: ActionRow[];
    dayRecords: Tables<"day_records">[];
    corrections: Tables<"day_corrections">[];
  };
  selectedDay: {
    localDate: string;
    plan: Tables<"daily_plans"> | null;
    actions: ActionRow[];
    commitments: CalendarCommitment[];
    dayRecords: Tables<"day_records">[];
    corrections: Tables<"day_corrections">[];
  } | null;
  subject: ClaritySubjectContext;
  omissions: {
    actions: number;
    commitments: number;
    corrections: number;
    lifeAreas: number;
  };
};

/**
 * Reads canonical rows directly. It deliberately never calls Daily Loop or
 * Calendar page loaders because those may materialize Routine occurrences.
 */
export async function assembleClarityContext(
  invocation: ClarityInvocation | null,
): Promise<ClarityAssembledContext> {
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const today = getLocalDate(profile.timezone);
  const recentFrom = addLocalDays(today, -CONTEXT_LIMITS.recentRealityDays);
  const calendarFrom = addLocalDays(today, -CONTEXT_LIMITS.calendarPastDays);
  const calendarThrough = addLocalDays(
    today,
    CONTEXT_LIMITS.calendarFutureDays,
  );
  const subject = await loadInvocationSubject(supabase, user.id, invocation);
  const calendarDates = localDateRange(calendarFrom, calendarThrough);
  const subjectDate = subject?.kind === "day" || subject?.kind === "calendar_occurrence"
    ? subject.localDate
    : subject?.kind === "action"
      ? subject.value.local_date
      : null;
  if (subjectDate && !calendarDates.includes(subjectDate)) {
    calendarDates.push(subjectDate);
  }
  const actionDateFilter = [
    `and(local_date.gte.${recentFrom},local_date.lte.${calendarThrough})`,
    `and(due_local_date.gte.${calendarFrom},due_local_date.lte.${calendarThrough})`,
    ...(subjectDate
      ? [`local_date.eq.${subjectDate}`, `due_local_date.eq.${subjectDate}`]
      : []),
  ].join(",");
  const planDateFilter = [
    `and(local_date.gte.${recentFrom},local_date.lte.${today})`,
    ...(subjectDate ? [`local_date.eq.${subjectDate}`] : []),
  ].join(",");

  const [
    lifeResult,
    memory,
    planResult,
    actionResult,
    subjectDateActionResult,
    recentPlanResult,
    correctionResult,
    commitmentResults,
  ] = await Promise.all([
    supabase.rpc("get_life_model"),
    loadClarityMemoryContext(supabase, user.id),
    supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("local_date", today)
      .maybeSingle(),
    supabase
      .from("daily_actions")
      .select("*")
      .eq("user_id", user.id)
      .or(actionDateFilter)
      .order("local_date", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(80),
    subjectDate
      ? supabase
          .from("daily_actions")
          .select("*")
          .eq("user_id", user.id)
          .or(
            `local_date.eq.${subjectDate},due_local_date.eq.${subjectDate}`,
          )
          .order("sort_order", { ascending: true })
          .limit(CONTEXT_LIMITS.maxActions)
      : Promise.resolve({ data: [] as ActionRow[], error: null }),
    supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", user.id)
      .or(planDateFilter),
    supabase
      .from("day_corrections")
      .select("*")
      .eq("user_id", user.id)
      .or(planDateFilter)
      .order("local_date", { ascending: false })
      .limit(40),
    Promise.all(
      calendarDates.map((localDate) =>
        supabase.rpc("get_calendar_commitments_for_date", {
          p_local_date: localDate,
        }),
      ),
    ),
  ]);

  throwIfError(lifeResult.error);
  throwIfError(planResult.error);
  throwIfError(actionResult.error);
  throwIfError(subjectDateActionResult.error);
  throwIfError(recentPlanResult.error);
  throwIfError(correctionResult.error);
  commitmentResults.forEach((result) => throwIfError(result.error));

  const life = parseLifeModel(lifeResult.data);
  const actions = mergeSubjectAction(
    dedupeActions([
      ...(actionResult.data ?? []),
      ...(subjectDateActionResult.data ?? []),
    ]),
    subject,
  );
  const commitments = dedupeCommitments(
    commitmentResults.flatMap((result) =>
      parseCalendarCommitments(result.data),
    ),
  );
  const relevantPlans = recentPlanResult.data ?? [];
  const recentPlanIds = relevantPlans.map((plan) => plan.id);
  const dayRecords = recentPlanIds.length > 0
    ? await loadDayRecords(supabase, user.id, recentPlanIds)
    : [];
  const calendarActions = actions
    .filter(
      (action) =>
        calendarDates.includes(action.local_date) ||
        (action.due_local_date !== null &&
          calendarDates.includes(action.due_local_date)),
    )
    .map((action) => ({
      ...action,
      projections: [
        ...(calendarDates.includes(action.local_date)
          ? ["scheduled" as const]
          : []),
        ...(action.due_local_date &&
        calendarDates.includes(action.due_local_date)
          ? ["due" as const]
          : []),
      ],
    }));
  const recentActions = actions.filter(
    (action) =>
      inRange(action.local_date, recentFrom, today) &&
      (action.status !== "proposed" || action.completion_evidence_only),
  ).sort((left, right) => compareRecentReality(left, right, today));
  const boundedActions = prioritizeActions(
    actions,
    subject,
    today,
    subjectDate,
  ).slice(
    0,
    CONTEXT_LIMITS.maxActions,
  );
  const boundedCommitments = prioritizeCommitments(
    commitments,
    subject,
    today,
    subjectDate,
  ).slice(0, CONTEXT_LIMITS.maxCommitments);
  const boundedCorrections = (correctionResult.data ?? []).slice(
    0,
    CONTEXT_LIMITS.maxCorrections,
  );

  return {
    profile: profileContext(profile, today),
    life: selectLifeContext(life, subject),
    memory,
    today: {
      plan: planResult.data,
      actions: boundedActions
        .filter((action) => action.local_date === today)
        .sort(compareActionOrder),
    },
    calendar: {
      fromLocalDate: calendarFrom,
      throughLocalDate: calendarThrough,
      commitments: boundedCommitments,
      actions: calendarActions.filter((action) =>
        boundedActions.some((candidate) => candidate.id === action.id),
      ),
    },
    recentReality: {
      actions: recentActions.slice(0, CONTEXT_LIMITS.maxActions),
      dayRecords: dayRecords.filter((record) => {
        const plan = relevantPlans.find(
          (candidate) => candidate.id === record.daily_plan_id,
        );
        return Boolean(plan && inRange(plan.local_date, recentFrom, today));
      }),
      corrections: boundedCorrections.filter((correction) =>
        inRange(correction.local_date, recentFrom, today),
      ),
    },
    selectedDay: subjectDate
      ? {
          localDate: subjectDate,
          plan:
            relevantPlans.find((plan) => plan.local_date === subjectDate) ??
            (subjectDate === today ? planResult.data : null),
          actions: boundedActions
            .filter((action) => action.local_date === subjectDate)
            .sort(compareActionOrder),
          commitments: boundedCommitments.filter(
            (commitment) => commitment.occurrence_date === subjectDate,
          ),
          dayRecords: dayRecords.filter((record) => {
            const plan = relevantPlans.find(
              (candidate) => candidate.id === record.daily_plan_id,
            );
            return plan?.local_date === subjectDate;
          }),
          corrections: boundedCorrections.filter(
            (correction) => correction.local_date === subjectDate,
          ),
        }
      : null,
    subject,
    omissions: {
      actions: Math.max(0, actions.length - boundedActions.length),
      commitments: Math.max(0, commitments.length - boundedCommitments.length),
      corrections: Math.max(
        0,
        (correctionResult.data ?? []).length - boundedCorrections.length,
      ),
      lifeAreas: Math.max(0, life.areas.length - CONTEXT_LIMITS.maxLifeAreas),
    },
  };
}

export async function resolveClarityInvocationSubject(
  invocation: ClarityInvocation | null,
) {
  const { supabase, user } = await getAuthenticatedUserAndProfile();
  return loadInvocationSubject(supabase, user.id, invocation);
}

export function invocationDescriptor(
  invocation: ClarityInvocation | null,
): ClarityInvocationDescriptor {
  if (!invocation) {
    return {
      type: "general",
      actionId: null,
      calendarCommitmentId: null,
      localDate: null,
    };
  }
  if (invocation.kind === "daily_action") {
    return {
      type: "action",
      actionId: invocation.actionId,
      calendarCommitmentId: null,
      localDate: null,
    };
  }
  if (invocation.kind === "calendar_commitment") {
    return {
      type: "calendar_occurrence",
      actionId: null,
      calendarCommitmentId: invocation.commitmentId,
      localDate: invocation.localDate,
    };
  }
  return {
    type: "day",
    actionId: null,
    calendarCommitmentId: null,
    localDate: invocation.localDate,
  };
}

export function invocationFromDescriptor(
  descriptor: ClarityInvocationDescriptor,
): ClarityInvocation | null {
  return parseClarityInvocation(
    descriptor.type === "action"
      ? { context: "action", actionId: descriptor.actionId ?? undefined }
      : descriptor.type === "calendar_occurrence"
        ? {
            context: "calendar",
            commitmentId: descriptor.calendarCommitmentId ?? undefined,
            date: descriptor.localDate ?? undefined,
          }
        : descriptor.type === "day"
          ? { context: "day", date: descriptor.localDate ?? undefined }
          : {},
  );
}

async function loadInvocationSubject(
  supabase: RpcClient,
  userId: string,
  invocation: ClarityInvocation | null,
): Promise<ClaritySubjectContext> {
  if (!invocation) return null;
  if (invocation.kind === "day") {
    return {
      kind: "day",
      id: invocation.localDate,
      label: formatDayLabel(invocation.localDate),
      localDate: invocation.localDate,
    };
  }
  if (invocation.kind === "daily_action") {
    const { data, error } = await supabase
      .from("daily_actions")
      .select("*")
      .eq("id", invocation.actionId)
      .eq("user_id", userId)
      .maybeSingle();
    throwIfError(error);
    if (!data) throw new ClarityInvocationNotFoundError();
    return { kind: "action", id: data.id, label: data.title, value: data };
  }

  const { data, error } = await supabase.rpc(
    "get_calendar_commitments_for_date",
    { p_local_date: invocation.localDate },
  );
  throwIfError(error);
  const commitment = parseCalendarCommitments(data).find(
    (candidate) => candidate.id === invocation.commitmentId,
  );
  if (!commitment) throw new ClarityInvocationNotFoundError();
  const { data: relationships, error: relationshipsError } = await supabase
    .from("calendar_commitments")
    .select("life_area_id, goal_id, project_id, current_context_id")
    .eq("id", invocation.commitmentId)
    .eq("user_id", userId)
    .maybeSingle();
  throwIfError(relationshipsError);
  if (!relationships) throw new ClarityInvocationNotFoundError();
  return {
    kind: "calendar_occurrence",
    id: commitment.id,
    label: commitment.title,
    localDate: invocation.localDate,
    value: commitment,
    relationships,
  };
}

export class ClarityInvocationNotFoundError extends Error {
  constructor() {
    super("Clarity invocation subject not found.");
    this.name = "ClarityInvocationNotFoundError";
  }
}

function selectLifeContext(
  life: LifeModel,
  subject: ClaritySubjectContext = null,
) {
  const linkedAreaId = subject?.kind === "action"
    ? subject.value.life_area_id
    : subject?.kind === "calendar_occurrence"
      ? subject.relationships.life_area_id
      : null;
  const prioritizedAreas = [...life.areas].sort((left, right) => {
    if (left.id === linkedAreaId) return -1;
    if (right.id === linkedAreaId) return 1;
    return left.sort_order - right.sort_order;
  });
  const areas = prioritizedAreas
    .slice(0, CONTEXT_LIMITS.maxLifeAreas)
    .map((area) => ({
      id: area.id,
      name: area.name,
      currentState: area.currentState,
      desiredState: area.desiredState,
      goals: prioritizeLinked(area.goals, subjectRelationshipId(subject, "goal_id")).slice(0, 6),
      projects: prioritizeLinked(
        area.projects,
        subjectRelationshipId(subject, "project_id"),
      ).slice(0, 8),
      routines: prioritizeLinked(
        area.routines,
        subject?.kind === "action" ? subject.value.source_routine_id : null,
      ).slice(0, 6),
      currentContexts: prioritizeLinked(
        area.currentContexts,
        subject?.kind === "calendar_occurrence"
          ? subject.relationships.current_context_id
          : null,
      ).slice(0, 4),
      openQuestions: area.openQuestions.slice(0, 4),
      evidence: area.evidence.slice(0, CONTEXT_LIMITS.maxEvidencePerArea),
    }));
  return {
    currentDirection: life.currentDirection,
    areas,
    openQuestions: life.openQuestions.slice(0, 12),
  };
}

function subjectRelationshipId(
  subject: ClaritySubjectContext,
  field: "goal_id" | "project_id",
) {
  if (!subject || subject.kind === "day") return null;
  return subject.kind === "action"
    ? subject.value[field]
    : subject.relationships[field];
}

function prioritizeLinked<T extends { id: string }>(items: T[], id: string | null) {
  if (!id) return items;
  return [...items].sort((left, right) => {
    if (left.id === id) return -1;
    if (right.id === id) return 1;
    return 0;
  });
}

function profileContext(profile: Profile, today: string) {
  const now = new Date();
  return {
    name: profile.name,
    timezone: profile.timezone,
    dateOfBirth: profile.date_of_birth,
    age: ageOnDate(profile.date_of_birth, today),
    city: profile.city,
    country: profile.country,
    localDate: today,
    localTime: new Intl.DateTimeFormat("en-GB", {
      timeZone: profile.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now),
    truthState: "confirmed" as const,
  };
}

async function loadDayRecords(
  supabase: RpcClient,
  userId: string,
  planIds: string[],
) {
  const { data, error } = await supabase
    .from("day_records")
    .select("*")
    .eq("user_id", userId)
    .in("daily_plan_id", planIds)
    .order("created_at", { ascending: false })
    .limit(12);
  throwIfError(error);
  return data ?? [];
}

function mergeSubjectAction(
  actions: ActionRow[],
  subject: ClaritySubjectContext,
) {
  if (!subject || subject.kind !== "action") return actions;
  return actions.some((action) => action.id === subject.id)
    ? actions
    : [subject.value, ...actions];
}

function dedupeActions(actions: ActionRow[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}

function prioritizeActions(
  actions: ActionRow[],
  subject: ClaritySubjectContext,
  today: string,
  subjectDate: string | null,
) {
  return [...actions].sort((left, right) => {
    if (subject?.kind === "action") {
      if (left.id === subject.id) return -1;
      if (right.id === subject.id) return 1;
    }
    if (subjectDate) {
      const leftMatchesSubjectDate = actionMatchesDate(left, subjectDate);
      const rightMatchesSubjectDate = actionMatchesDate(right, subjectDate);
      if (leftMatchesSubjectDate && !rightMatchesSubjectDate) {
        return -1;
      }
      if (rightMatchesSubjectDate && !leftMatchesSubjectDate) {
        return 1;
      }
    }
    const leftRank = actionFreshnessRank(left, today);
    const rightRank = actionFreshnessRank(right, today);
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (leftRank === 1) {
      const leftDate = nextRelevantActionDate(left, today);
      const rightDate = nextRelevantActionDate(right, today);
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    }
    return right.local_date.localeCompare(left.local_date) ||
      left.sort_order - right.sort_order;
  });
}

function actionMatchesDate(action: ActionRow, localDate: string) {
  return action.local_date === localDate || action.due_local_date === localDate;
}

function actionFreshnessRank(action: ActionRow, today: string) {
  if (actionMatchesDate(action, today)) return 0;
  if (nextRelevantActionDate(action, today)) return 1;
  if (
    action.completion_evidence_only ||
    ["completed", "rescheduled", "dropped", "missed"].includes(action.status)
  ) {
    return 2;
  }
  if (action.status === "removed") return 4;
  return 3;
}

function nextRelevantActionDate(action: ActionRow, today: string) {
  return [action.local_date, action.due_local_date]
    .filter((value): value is string => Boolean(value && value > today))
    .sort()[0] ?? "";
}

function compareRecentReality(
  left: ActionRow,
  right: ActionRow,
  today: string,
) {
  const leftRank = actionFreshnessRank(left, today);
  const rightRank = actionFreshnessRank(right, today);
  return leftRank - rightRank ||
    right.local_date.localeCompare(left.local_date) ||
    left.sort_order - right.sort_order;
}

function prioritizeCommitments(
  commitments: CalendarCommitment[],
  subject: ClaritySubjectContext,
  today: string,
  subjectDate: string | null,
) {
  return [...commitments].sort((left, right) => {
    if (subject?.kind === "calendar_occurrence") {
      const leftSelected = left.id === subject.id && left.occurrence_date === subject.localDate;
      const rightSelected = right.id === subject.id && right.occurrence_date === subject.localDate;
      if (leftSelected) return -1;
      if (rightSelected) return 1;
    }
    const leftRank = commitmentDateRank(left.occurrence_date, today, subjectDate);
    const rightRank = commitmentDateRank(right.occurrence_date, today, subjectDate);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return leftRank === 3
      ? right.occurrence_date.localeCompare(left.occurrence_date)
      : left.occurrence_date.localeCompare(right.occurrence_date);
  });
}

function commitmentDateRank(
  localDate: string,
  today: string,
  subjectDate: string | null,
) {
  if (subjectDate && localDate === subjectDate) return 0;
  if (localDate === today) return 1;
  if (localDate > today) return 2;
  return 3;
}

function dedupeCommitments(commitments: CalendarCommitment[]) {
  const seen = new Set<string>();
  return commitments.filter((commitment) => {
    const key = `${commitment.id}:${commitment.occurrence_date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareActionOrder(left: ActionRow, right: ActionRow) {
  return left.sort_order - right.sort_order;
}

function ageOnDate(dateOfBirth: string | null, localDate: string) {
  if (!dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const [currentYear, currentMonth, currentDay] = localDate.split("-").map(Number);
  let age = currentYear - year;
  if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1;
  return age >= 0 ? age : null;
}

function localDateRange(from: string, through: string) {
  const dates: string[] = [];
  for (let date = from; date <= through; date = addLocalDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function inRange(value: string, from: string, through: string) {
  return value >= from && value <= through;
}

function formatDayLabel(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
