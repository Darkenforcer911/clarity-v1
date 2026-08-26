import { z } from "zod";

export const lifeProposalKindSchema = z.enum([
  "goal",
  "project",
  "routine",
  "current_context",
  "desired_state",
  "open_question",
]);

export type LifeProposalKind = z.infer<typeof lifeProposalKindSchema>;

export type LifeProposalAreaOption = {
  id: string;
  name: string;
};

export type LifeProposalDraft = {
  kind: LifeProposalKind;
  areaId: string | null;
  areaName: string;
  title: string;
  description: string;
};

export type LifeProposalOperation = Record<string, unknown> & {
  type: string;
};

export type MentorLifeProposalInput = {
  intent: string;
  kind: LifeProposalKind;
  existingAreaId: string | null;
  areaName: string;
  title: string;
  description: string;
  desiredState: string | null;
  routineCadence: "daily" | "weekly";
  routineEstimatedMinutes: number;
  includeInCurrentDirection: boolean;
  directionSummary: string | null;
  directionRationale: string | null;
};

export type MentorLifeProposalContext = {
  areas: LifeProposalAreaOption[];
  currentDirectionGoalIds: string[];
  localDate: string;
};

export type BuiltMentorLifeProposal = {
  userFacingSummary: string;
  proposedChanges: {
    operations: LifeProposalOperation[];
  };
};

const areaSignals: Array<{ name: string; words: string[] }> = [
  { name: "Career", words: ["career", "job", "work", "business", "interview"] },
  { name: "Education", words: ["study", "degree", "course", "school", "university"] },
  { name: "Finance", words: ["money", "income", "saving", "debt", "financial"] },
  { name: "Health", words: ["health", "fitness", "exercise", "medical", "sleep"] },
  { name: "Relationships", words: ["relationship", "partner", "family", "friend", "social"] },
  { name: "Personal Growth", words: ["learn", "skill", "piano", "language", "creative"] },
];

export function interpretLifeIntent(
  rawIntent: string,
  areas: LifeProposalAreaOption[],
): LifeProposalDraft {
  const intent = rawIntent.trim();
  const lower = intent.toLowerCase();
  const inferredAreaName = areaSignals.find(({ words }) =>
    words.some((word) => lower.includes(word)),
  )?.name ?? "Personal Growth";
  const existingArea = areas.find(
    (area) => area.name.toLowerCase() === inferredAreaName.toLowerCase(),
  );

  let kind: LifeProposalKind = "goal";
  if (/\?|\b(i do not know|i don't know|not sure|figure out|decide whether)\b/.test(lower)) {
    kind = "open_question";
  } else if (/\b(every day|daily|every week|weekly|habit|routine)\b/.test(lower)) {
    kind = "routine";
  } else if (/\b(right now|currently|at the moment|for the next)\b/.test(lower)) {
    kind = "current_context";
  } else if (/\b(build|launch|finish|complete|project)\b/.test(lower)) {
    kind = "project";
  } else if (/\bi want my .+ (to be|to feel|to look)\b/.test(lower)) {
    kind = "desired_state";
  }

  return {
    kind,
    areaId: existingArea?.id ?? null,
    areaName: existingArea?.name ?? inferredAreaName,
    title: conciseTitle(intent),
    description: intent,
  };
}

export function buildMentorLifeProposal(
  input: MentorLifeProposalInput,
  context: MentorLifeProposalContext,
  createId: () => string = () => crypto.randomUUID(),
): BuiltMentorLifeProposal {
  const existingArea = input.existingAreaId
    ? context.areas.find((area) => area.id === input.existingAreaId)
    : null;

  if (input.existingAreaId && !existingArea) {
    throw new Error("Choose a valid Life Area.");
  }

  if (input.includeInCurrentDirection && input.kind !== "goal") {
    throw new Error("Only a Goal can be added to Current Direction.");
  }

  const areaId = existingArea?.id ?? createId();
  const operations: LifeProposalOperation[] = [];
  if (!existingArea) {
    operations.push({
      type: "create_life_area",
      id: areaId,
      name: input.areaName,
      sort_order: context.areas.length,
    });
  }

  let createdGoalId: string | null = null;
  switch (input.kind) {
    case "goal":
      createdGoalId = createId();
      operations.push({
        type: "create_goal",
        id: createdGoalId,
        life_area_id: areaId,
        title: input.title,
        desired_outcome: input.description,
        status: "exploring",
      });
      break;
    case "project":
      operations.push({
        type: "create_project",
        id: createId(),
        life_area_id: areaId,
        goal_id: null,
        parent_project_id: null,
        title: input.title,
        desired_outcome: input.description,
        status: "planned",
      });
      break;
    case "routine":
      operations.push({
        type: "create_routine",
        id: createId(),
        life_area_id: areaId,
        goal_id: null,
        project_id: null,
        title: input.title,
        status: "active",
        cadence: input.routineCadence,
        cadence_count: null,
        weekdays: [],
        estimated_minutes: input.routineEstimatedMinutes,
        preferred_time: null,
        skip_policy: "skip",
      });
      break;
    case "current_context":
      operations.push({
        type: "create_current_context",
        id: createId(),
        life_area_id: areaId,
        title: input.title,
        planning_impact: input.description,
        started_on: context.localDate,
        expected_end_start: null,
        expected_end_end: null,
      });
      break;
    case "desired_state":
      operations.push({
        type: "set_desired_state",
        life_area_id: areaId,
        summary: input.description,
        target_start_date: null,
        target_end_date: null,
        target_confidence: null,
      });
      break;
    case "open_question":
      operations.push({
        type: "create_open_question",
        id: createId(),
        life_area_id: areaId,
        question: input.title,
        context: input.description === input.title ? null : input.description,
      });
      break;
  }

  if (input.desiredState) {
    operations.push({
      type: "set_desired_state",
      life_area_id: areaId,
      summary: input.desiredState,
      target_start_date: null,
      target_end_date: null,
      target_confidence: null,
    });
  }

  if (input.includeInCurrentDirection && createdGoalId) {
    operations.push({
      type: "set_current_direction",
      id: createId(),
      summary: input.directionSummary,
      rationale: input.directionRationale,
      started_on: context.localDate,
      review_on: null,
      goal_ids: [...context.currentDirectionGoalIds, createdGoalId],
    });
  }

  return {
    userFacingSummary: input.intent,
    proposedChanges: { operations },
  };
}

export function kindLabel(kind: LifeProposalKind) {
  return {
    goal: "Goal",
    project: "Project",
    routine: "Routine",
    current_context: "Current Context",
    desired_state: "Desired State",
    open_question: "Open Question",
  }[kind];
}

function conciseTitle(intent: string) {
  const withoutLead = intent
    .replace(/^i(?:'d| would) like to\s+/i, "")
    .replace(/^i want to\s+/i, "")
    .replace(/^i want\s+/i, "")
    .trim();
  const title = withoutLead || intent;
  return title.charAt(0).toUpperCase() + title.slice(1).replace(/[?.!]$/, "");
}
