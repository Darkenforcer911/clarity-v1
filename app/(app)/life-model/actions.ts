"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { LifeModelActionState } from "@/lib/clarity/life-model-action-state";
import {
  archiveLifeArea,
  archiveLifeEvidence,
  correctLifeEvidence,
  endCurrentContext,
  renameLifeArea,
  reorderLifeAreas,
  setLifeAreaCurrentState,
  transitionGoalStatus,
  transitionProjectStatus,
  transitionRoutineStatus,
  updateCurrentContext,
  updateGoal,
  updateProject,
  updateRoutine,
} from "@/lib/clarity/life-model-mutations";

const uuid = z.string().uuid();
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalUuid = z.union([uuid, z.literal("")]).transform((value) => value || null);
const optionalDate = z.union([z.iso.date(), z.literal("")]).transform((value) => value || null);
const optionalTime = z.union([
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  z.literal(""),
]).transform((value) => value || null);
const targetConfidence = z.union([
  z.enum(["estimated", "aspirational"]),
  z.literal(""),
]).transform((value) => value || null);

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function targetFields(formData: FormData) {
  return z.object({
    targetStartDate: optionalDate,
    targetEndDate: optionalDate,
    targetConfidence,
  }).superRefine((value, context) => {
    const supplied = [
      value.targetStartDate,
      value.targetEndDate,
      value.targetConfidence,
    ].filter(Boolean).length;
    if (supplied !== 0 && supplied !== 3) {
      context.addIssue({
        code: "custom",
        message: "Add both target dates and confidence, or leave all three blank.",
      });
    }
    if (
      value.targetStartDate &&
      value.targetEndDate &&
      value.targetEndDate < value.targetStartDate
    ) {
      context.addIssue({
        code: "custom",
        message: "Target end date cannot be before the start date.",
      });
    }
  }).parse({
    targetStartDate: formValue(formData, "targetStartDate"),
    targetEndDate: formValue(formData, "targetEndDate"),
    targetConfidence: formValue(formData, "targetConfidence"),
  });
}

export async function mutateLifeModelAction(
  previous: LifeModelActionState,
  formData: FormData,
): Promise<LifeModelActionState> {
  try {
    const operation = z.enum([
      "renameLifeArea",
      "reorderLifeAreas",
      "archiveLifeArea",
      "setCurrentState",
      "updateGoal",
      "transitionGoal",
      "updateProject",
      "transitionProject",
      "updateRoutine",
      "transitionRoutine",
      "updateContext",
      "endContext",
      "correctEvidence",
      "archiveEvidence",
    ]).parse(formData.get("operation"));

    switch (operation) {
      case "renameLifeArea":
        await renameLifeArea(
          uuid.parse(formData.get("lifeAreaId")),
          requiredText(100).parse(formData.get("name")),
        );
        break;
      case "reorderLifeAreas":
        await reorderLifeAreas(
          z.array(uuid).min(1).parse(formData.getAll("orderedLifeAreaId")),
        );
        break;
      case "archiveLifeArea":
        await archiveLifeArea(uuid.parse(formData.get("lifeAreaId")));
        break;
      case "setCurrentState":
        await setLifeAreaCurrentState(z.object({
          lifeAreaId: uuid,
          summary: requiredText(5000),
          asOfDate: z.iso.date(),
        }).parse({
          lifeAreaId: formData.get("lifeAreaId"),
          summary: formData.get("summary"),
          asOfDate: formData.get("asOfDate"),
        }));
        break;
      case "updateGoal": {
        const target = targetFields(formData);
        const input = z.object({
          id: uuid,
          title: requiredText(200),
          desiredOutcome: requiredText(2000),
        }).parse({
          id: formData.get("goalId"),
          title: formData.get("title"),
          desiredOutcome: formData.get("desiredOutcome"),
        });
        await updateGoal({ ...input, ...target });
        break;
      }
      case "transitionGoal":
        await transitionGoalStatus(z.object({
          id: uuid,
          status: z.enum(["active", "achieved", "abandoned"]),
          rationale: z.string().trim().max(5000).transform((value) => value || null),
        }).parse({
          id: formData.get("goalId"),
          status: formData.get("newStatus"),
          rationale: formValue(formData, "rationale"),
        }));
        break;
      case "updateProject": {
        const target = targetFields(formData);
        const input = z.object({
          id: uuid,
          title: requiredText(200),
          desiredOutcome: requiredText(2000),
          goalId: optionalUuid,
          parentProjectId: optionalUuid,
        }).parse({
          id: formData.get("projectId"),
          title: formData.get("title"),
          desiredOutcome: formData.get("desiredOutcome"),
          goalId: formValue(formData, "goalId"),
          parentProjectId: formValue(formData, "parentProjectId"),
        });
        await updateProject({ ...input, ...target });
        break;
      }
      case "transitionProject":
        await transitionProjectStatus(
          uuid.parse(formData.get("projectId")),
          z.enum(["active", "paused", "completed", "cancelled"]).parse(
            formData.get("newStatus"),
          ),
        );
        break;
      case "updateRoutine": {
        const input = z.object({
          id: uuid,
          title: requiredText(200),
          cadence: z.enum(["daily", "weekly", "times_per_week", "certain_days"]),
          estimatedMinutes: z.coerce.number().int().min(1).max(1440),
          goalId: optionalUuid,
          projectId: optionalUuid,
          cadenceCount: z.union([
            z.coerce.number().int().min(1).max(7),
            z.literal("").transform(() => null),
          ]),
          weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7),
          preferredTime: optionalTime,
          skipPolicy: z.enum(["skip", "offer_makeup"]),
        }).superRefine((value, context) => {
          if (value.cadence === "times_per_week" && value.cadenceCount === null) {
            context.addIssue({ code: "custom", message: "Choose how many times per week." });
          }
          if (value.cadence === "certain_days" && value.weekdays.length === 0) {
            context.addIssue({ code: "custom", message: "Choose at least one weekday." });
          }
        }).parse({
          id: formData.get("routineId"),
          title: formData.get("title"),
          cadence: formData.get("cadence"),
          estimatedMinutes: formData.get("estimatedMinutes"),
          goalId: formValue(formData, "goalId"),
          projectId: formValue(formData, "projectId"),
          cadenceCount: formValue(formData, "cadenceCount"),
          weekdays: formData.getAll("weekday"),
          preferredTime: formValue(formData, "preferredTime"),
          skipPolicy: formData.get("skipPolicy"),
        });
        await updateRoutine({
          ...input,
          cadenceCount: input.cadence === "times_per_week" ? input.cadenceCount : null,
          weekdays: input.cadence === "certain_days" ? input.weekdays : [],
        });
        break;
      }
      case "transitionRoutine":
        await transitionRoutineStatus(
          uuid.parse(formData.get("routineId")),
          z.enum(["active", "paused", "ended"]).parse(formData.get("newStatus")),
        );
        break;
      case "updateContext":
        await updateCurrentContext(z.object({
          id: uuid,
          title: requiredText(200),
          planningImpact: requiredText(5000),
          startedOn: z.iso.date(),
          expectedEndStart: optionalDate,
          expectedEndEnd: optionalDate,
        }).superRefine((value, context) => {
          const supplied = [value.expectedEndStart, value.expectedEndEnd].filter(Boolean).length;
          if (supplied === 1) {
            context.addIssue({ code: "custom", message: "Add both expected-end dates or neither." });
          }
          if (
            value.expectedEndStart &&
            value.expectedEndEnd &&
            value.expectedEndEnd < value.expectedEndStart
          ) {
            context.addIssue({ code: "custom", message: "Expected end cannot finish before it starts." });
          }
        }).parse({
          id: formData.get("contextId"),
          title: formData.get("title"),
          planningImpact: formData.get("planningImpact"),
          startedOn: formData.get("startedOn"),
          expectedEndStart: formValue(formData, "expectedEndStart"),
          expectedEndEnd: formValue(formData, "expectedEndEnd"),
        }));
        break;
      case "endContext":
        await endCurrentContext(uuid.parse(formData.get("contextId")));
        break;
      case "correctEvidence":
        await correctLifeEvidence(z.object({
          id: uuid,
          summary: requiredText(5000),
          occurredOn: z.iso.date(),
          signal: z.enum(["supports", "challenges", "neutral"]),
        }).parse({
          id: formData.get("evidenceId"),
          summary: formData.get("summary"),
          occurredOn: formData.get("occurredOn"),
          signal: formData.get("signal"),
        }));
        break;
      case "archiveEvidence":
        await archiveLifeEvidence(uuid.parse(formData.get("evidenceId")));
        break;
    }

    revalidatePath("/life-model");
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message ?? "Check the information and try again."
      : error instanceof Error
        ? error.message
        : "Something went wrong.";
    return { error: message, saved: false, version: previous.version + 1 };
  }
}
