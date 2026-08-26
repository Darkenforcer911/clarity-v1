"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getLocalDate } from "@/lib/clarity/date-time";
import { getAuthenticatedUserAndProfile } from "@/lib/clarity/daily-loop-queries";
import { getLifeModel } from "@/lib/clarity/life-model-service";
import type { LifeModelProposalActionState } from "@/lib/clarity/life-model-proposal-action-state";
import {
  buildMentorLifeProposal,
  lifeProposalKindSchema,
} from "@/lib/clarity/life-model-proposal";
import {
  confirmLifeModelChangeProposal,
  createMentorLifeModelChangeProposal,
  rejectLifeModelChangeProposal,
} from "@/lib/clarity/life-model-mutations";

const uuid = z.string().uuid();
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null);

export async function createMentorLifeProposalAction(
  _previous: LifeModelProposalActionState,
  formData: FormData,
): Promise<LifeModelProposalActionState> {
  let proposalId: string;

  try {
    const parsed = z.object({
      intent: requiredText(2000),
      kind: lifeProposalKindSchema,
      existingAreaId: z.union([uuid, z.literal("")]).transform((value) => value || null),
      areaName: requiredText(100),
      title: requiredText(200),
      description: requiredText(2000),
      desiredState: optionalText(5000),
      routineCadence: z.enum(["daily", "weekly"]),
      routineEstimatedMinutes: z.coerce.number().int().min(1).max(1440),
      includeInCurrentDirection: z.boolean(),
      directionSummary: optionalText(2000),
      directionRationale: optionalText(5000),
    }).superRefine((value, context) => {
      if (
        value.includeInCurrentDirection &&
        (!value.directionSummary || !value.directionRationale)
      ) {
        context.addIssue({
          code: "custom",
          message: "Add a direction summary and reason before prioritising this Goal.",
        });
      }
    }).parse({
      intent: formData.get("intent"),
      kind: formData.get("kind"),
      existingAreaId: formData.get("existingAreaId") ?? "",
      areaName: formData.get("areaName"),
      title: formData.get("title"),
      description: formData.get("description"),
      desiredState: formData.get("desiredState") ?? "",
      routineCadence: formData.get("routineCadence") ?? "weekly",
      routineEstimatedMinutes: formData.get("routineEstimatedMinutes") ?? "30",
      includeInCurrentDirection: formData.get("includeInCurrentDirection") === "true",
      directionSummary: formData.get("directionSummary") ?? "",
      directionRationale: formData.get("directionRationale") ?? "",
    });

    const { profile } = await getAuthenticatedUserAndProfile();
    const model = await getLifeModel();
    const built = buildMentorLifeProposal(parsed, {
      areas: model.areas.map(({ id, name }) => ({ id, name })),
      currentDirectionGoalIds:
        model.currentDirection?.goals
          .filter((goal) => goal.status === "exploring" || goal.status === "active")
          .map((goal) => goal.goalId) ?? [],
      localDate: getLocalDate(profile.timezone),
    });
    proposalId = await createMentorLifeModelChangeProposal(built);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof z.ZodError
          ? error.issues[0]?.message ?? "Review the proposal and try again."
          : error instanceof Error
            ? error.message
            : "Clarity could not create this proposal.",
    };
  }

  redirect(`/life-model/proposals/${proposalId}`);
}

export async function confirmMentorLifeProposalAction(
  _previous: LifeModelProposalActionState,
  formData: FormData,
): Promise<LifeModelProposalActionState> {
  try {
    await confirmLifeModelChangeProposal(uuid.parse(formData.get("proposalId")));
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Clarity could not add this to Life.",
    };
  }

  revalidatePath("/life-model");
  redirect("/life-model?notice=added-to-life");
}

export async function rejectMentorLifeProposalAction(
  _previous: LifeModelProposalActionState,
  formData: FormData,
): Promise<LifeModelProposalActionState> {
  try {
    await rejectLifeModelChangeProposal(uuid.parse(formData.get("proposalId")));
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Clarity could not dismiss this proposal.",
    };
  }

  redirect("/life-model");
}
