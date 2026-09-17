"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ClarityProposalActionState } from "@/lib/clarity/ai/clarity-proposal-action-state";
import {
  confirmClarityMemoryUpdateProposal,
  dismissClarityChangeProposal,
  editClarityMemoryUpdateProposal,
} from "@/lib/clarity/ai/clarity-proposal-service";

const proposalIdSchema = z.string().uuid();

export async function confirmClarityMemoryProposalAction(
  _previous: ClarityProposalActionState,
  formData: FormData,
): Promise<ClarityProposalActionState> {
  try {
    await confirmClarityMemoryUpdateProposal(
      proposalIdSchema.parse(formData.get("proposalId")),
    );
    revalidatePath("/clarity");
    return {
      status: "success",
      message: "Updated what Clarity knows.",
      completedAt: Date.now(),
    };
  } catch (error) {
    revalidatePath("/clarity");
    return actionError(error, "Clarity could not apply this update.");
  }
}

export async function editClarityMemoryProposalAction(
  _previous: ClarityProposalActionState,
  formData: FormData,
): Promise<ClarityProposalActionState> {
  try {
    const parsed = z
      .object({
        id: proposalIdSchema,
        expectedRevision: z.coerce.number().int().positive(),
        replacementStatement: z.string().trim().min(1).max(1000),
        effectiveOn: z.union([z.literal(""), z.iso.date()]).transform(
          (value) => value || null,
        ),
      })
      .parse({
        id: formData.get("proposalId"),
        expectedRevision: formData.get("expectedRevision"),
        replacementStatement: formData.get("replacementStatement"),
        effectiveOn: formData.get("effectiveOn") ?? "",
      });
    await editClarityMemoryUpdateProposal(parsed);
    revalidatePath("/clarity");
    return {
      status: "success",
      message: "Proposal updated.",
      completedAt: Date.now(),
    };
  } catch (error) {
    revalidatePath("/clarity");
    return actionError(error, "Clarity could not edit this proposal.");
  }
}

export async function dismissClarityProposalAction(
  _previous: ClarityProposalActionState,
  formData: FormData,
): Promise<ClarityProposalActionState> {
  try {
    await dismissClarityChangeProposal(
      proposalIdSchema.parse(formData.get("proposalId")),
    );
    revalidatePath("/clarity");
    return {
      status: "success",
      message: "Left unchanged.",
      completedAt: Date.now(),
    };
  } catch (error) {
    return actionError(error, "Clarity could not dismiss this proposal.");
  }
}

function actionError(error: unknown, fallback: string): ClarityProposalActionState {
  return {
    status: "error",
    message:
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? fallback
        : error instanceof Error
          ? error.message
          : fallback,
    completedAt: Date.now(),
  };
}
