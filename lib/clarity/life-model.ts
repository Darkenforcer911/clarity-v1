import { z } from "zod";

const uuidSchema = z.string().uuid();
const nullableUuidSchema = uuidSchema.nullable();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampSchema = z.string().min(1);

export const lifeModelProvenanceSchema = z.enum([
  "user_stated",
  "ai_confirmed",
  "system_derived",
]);

const currentStateSchema = z.object({
  summary: z.string(),
  as_of_date: dateSchema,
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  confirmed_at: timestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const desiredStateSchema = z.object({
  summary: z.string(),
  target_start_date: dateSchema.nullable(),
  target_end_date: dateSchema.nullable(),
  target_confidence: z.enum(["estimated", "aspirational"]).nullable(),
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  confirmed_at: timestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const openQuestionSchema = z.object({
  id: uuidSchema,
  life_area_id: nullableUuidSchema,
  question: z.string(),
  context: z.string().nullable(),
  status: z.literal("open"),
  resolution_summary: z.null(),
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  resolved_at: z.null(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const goalDecisionSchema = z.object({
  id: uuidSchema,
  goal_id: uuidSchema,
  decision_type: z.enum([
    "explored",
    "committed",
    "changed",
    "achieved",
    "abandoned",
    "replaced",
  ]),
  rationale: z.string(),
  evidence_summary: z.string().nullable(),
  consequence_summary: z.string().nullable(),
  replacement_goal_id: nullableUuidSchema,
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  decided_at: timestampSchema,
  created_at: timestampSchema,
});

const goalSchema = z.object({
  id: uuidSchema,
  life_area_id: uuidSchema,
  title: z.string(),
  desired_outcome: z.string(),
  status: z.enum(["exploring", "active"]),
  target_start_date: dateSchema.nullable(),
  target_end_date: dateSchema.nullable(),
  target_confidence: z.enum(["estimated", "aspirational"]).nullable(),
  replaced_by_goal_id: nullableUuidSchema,
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  archived_at: timestampSchema.nullable(),
  decisions: z.array(goalDecisionSchema),
});

const projectSchema = z.object({
  id: uuidSchema,
  life_area_id: uuidSchema,
  goal_id: nullableUuidSchema,
  parent_project_id: nullableUuidSchema,
  title: z.string(),
  desired_outcome: z.string(),
  status: z.enum(["planned", "active", "paused"]),
  target_start_date: dateSchema.nullable(),
  target_end_date: dateSchema.nullable(),
  target_confidence: z.enum(["estimated", "aspirational"]).nullable(),
  replaced_by_project_id: nullableUuidSchema,
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  archived_at: timestampSchema.nullable(),
});

const routineSchema = z.object({
  id: uuidSchema,
  life_area_id: uuidSchema,
  goal_id: nullableUuidSchema,
  project_id: nullableUuidSchema,
  title: z.string(),
  status: z.enum(["active", "paused"]),
  cadence: z.enum(["daily", "weekly", "times_per_week", "certain_days"]),
  cadence_count: z.number().int().nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)),
  estimated_minutes: z.number().int().positive(),
  preferred_time: z.string().nullable(),
  skip_policy: z.enum(["skip", "offer_makeup"]),
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  ended_at: timestampSchema.nullable(),
});

const currentContextSchema = z.object({
  id: uuidSchema,
  life_area_id: uuidSchema,
  title: z.string(),
  planning_impact: z.string(),
  status: z.literal("active"),
  started_on: dateSchema,
  expected_end_start: dateSchema.nullable(),
  expected_end_end: dateSchema.nullable(),
  ended_on: dateSchema.nullable(),
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const lifeEvidenceSchema = z.object({
  id: uuidSchema,
  life_area_id: uuidSchema,
  goal_id: nullableUuidSchema,
  project_id: nullableUuidSchema,
  summary: z.string(),
  occurred_on: dateSchema,
  signal: z.enum(["supports", "challenges", "neutral"]),
  source_daily_action_id: nullableUuidSchema,
  source_calendar_occurrence_id: nullableUuidSchema,
  source_day_correction_id: nullableUuidSchema,
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  archived_at: timestampSchema.nullable(),
});

const lifeAreaSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  status: z.literal("active"),
  sort_order: z.number().int().nonnegative(),
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema.optional().default(null),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  archived_at: timestampSchema.nullable(),
  currentState: currentStateSchema.nullable(),
  desiredState: desiredStateSchema.nullable().optional().default(null),
  goals: z.array(goalSchema),
  projects: z.array(projectSchema),
  routines: z.array(routineSchema),
  currentContexts: z.array(currentContextSchema),
  openQuestions: z.array(openQuestionSchema).optional().default([]),
  evidence: z.array(lifeEvidenceSchema),
});

const currentDirectionSchema = z.object({
  id: uuidSchema,
  summary: z.string(),
  rationale: z.string(),
  started_on: dateSchema,
  review_on: dateSchema.nullable(),
  created_via: lifeModelProvenanceSchema,
  source_proposal_id: nullableUuidSchema,
  confirmed_at: timestampSchema,
  superseded_at: z.null(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  goals: z.array(
    z.object({
      goalId: uuidSchema,
      sortOrder: z.number().int().nonnegative(),
      lifeAreaId: uuidSchema,
      title: z.string(),
      status: z.enum(["exploring", "active", "achieved", "abandoned"]),
    }),
  ),
});

const dailyActionRelationshipSchema = z.object({
  dailyActionId: uuidSchema,
  lifeAreaId: nullableUuidSchema,
  goalId: nullableUuidSchema,
  projectId: nullableUuidSchema,
  sourceRoutineId: nullableUuidSchema,
  sourceCalendarCommitmentId: nullableUuidSchema,
  relationshipSource: lifeModelProvenanceSchema.nullable(),
  currentContextIds: z.array(uuidSchema),
});

const calendarCommitmentRelationshipSchema = z.object({
  calendarCommitmentId: uuidSchema,
  lifeAreaId: nullableUuidSchema,
  goalId: nullableUuidSchema,
  projectId: nullableUuidSchema,
  currentContextId: nullableUuidSchema,
  relationshipSource: lifeModelProvenanceSchema,
});

export const lifeModelSchema = z.object({
  areas: z.array(lifeAreaSchema),
  openQuestions: z.array(openQuestionSchema).optional().default([]),
  currentDirection: currentDirectionSchema.nullable().optional().default(null),
  relationships: z.object({
    dailyActions: z.array(dailyActionRelationshipSchema),
    calendarCommitments: z.array(calendarCommitmentRelationshipSchema),
  }),
});

export type LifeModel = z.infer<typeof lifeModelSchema>;

export function parseLifeModel(input: unknown): LifeModel {
  return lifeModelSchema.parse(input);
}
