"use client";

import { ArrowLeft, Check, Pencil } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import {
  confirmMentorLifeProposalAction,
  rejectMentorLifeProposalAction,
} from "@/app/(app)/life-model/proposal-actions";
import { Button } from "@/components/ui/button";
import {
  initialLifeModelProposalActionState,
} from "@/lib/clarity/life-model-proposal-action-state";
import type { LifeModelChangeProposal } from "@/lib/clarity/life-model-proposal-service";
import { PendingButton } from "./pending-button";

export function LifeProposalReview({
  proposal,
  areaNames,
}: {
  proposal: LifeModelChangeProposal;
  areaNames: Record<string, string>;
}) {
  const [confirmState, confirmAction] = useActionState(
    confirmMentorLifeProposalAction,
    initialLifeModelProposalActionState,
  );
  const [rejectState, rejectAction] = useActionState(
    rejectMentorLifeProposalAction,
    initialLifeModelProposalActionState,
  );
  const operations = proposal.proposed_changes.operations;
  const createdArea = operations.find((operation) => operation.type === "create_life_area");
  const canonicalOperation = operations.find((operation) =>
    [
      "create_goal",
      "create_project",
      "create_routine",
      "create_current_context",
      "create_open_question",
      "set_desired_state",
    ].includes(String(operation.type)),
  );
  const directionOperation = operations.find(
    (operation) => operation.type === "set_current_direction",
  );
  const areaId = String(
    canonicalOperation?.life_area_id ?? createdArea?.id ?? "",
  );
  const areaName = String(
    createdArea?.name ?? areaNames[areaId] ?? "Across my life",
  );

  if (proposal.status !== "pending") {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Proposal resolved</h1>
        <p className="text-sm text-muted-foreground">
          This proposal is {proposal.status}. Your canonical Life view shows the current result.
        </p>
        <Button asChild className="h-12 w-full rounded-xl">
          <Link href="/life-model">Return to Life</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/life-model"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to Life
      </Link>
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Life proposal
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">
          Review before adding
        </h1>
        <p className="text-sm text-muted-foreground">
          Nothing enters your canonical Life Model until you confirm this proposal.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <ProposalFact label="You said" value={proposal.user_facing_summary} />
        <ProposalFact label="Life Area" value={areaName} />
        {canonicalOperation && (
          <ProposalFact
            label={operationLabel(String(canonicalOperation.type))}
            value={operationValue(canonicalOperation)}
          />
        )}
        {operations
          .filter((operation) => operation.type === "set_desired_state" && operation !== canonicalOperation)
          .map((operation, index) => (
            <ProposalFact key={index} label="Desired State" value={String(operation.summary)} />
          ))}
        <ProposalFact
          label="Current Direction impact"
          value={
            directionOperation
              ? String(directionOperation.summary)
              : "None — added to Life, not prioritised yet"
          }
        />
      </section>

      <div className="space-y-3">
        <form action={confirmAction}>
          <input type="hidden" name="proposalId" value={proposal.id} />
          <PendingButton pendingLabel="Adding to Life…" className="h-12 w-full rounded-xl">
            <Check /> Add to Life
          </PendingButton>
        </form>
        <Button asChild variant="secondary" className="h-12 w-full rounded-xl">
          <Link href={`/life-model/add?intent=${encodeURIComponent(proposal.user_facing_summary)}`}>
            <Pencil /> Edit proposal
          </Link>
        </Button>
        <form action={rejectAction}>
          <input type="hidden" name="proposalId" value={proposal.id} />
          <PendingButton variant="ghost" pendingLabel="Dismissing…" className="h-11 w-full rounded-xl text-muted-foreground">
            Not now
          </PendingButton>
        </form>
      </div>

      {(confirmState.status === "error" || rejectState.status === "error") && (
        <p role="alert" className="text-sm text-destructive">
          {confirmState.message ?? rejectState.message}
        </p>
      )}
    </div>
  );
}

function ProposalFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function operationLabel(type: string) {
  return {
    create_goal: "Goal",
    create_project: "Project",
    create_routine: "Routine",
    create_current_context: "Current Context",
    create_open_question: "Open Question",
    set_desired_state: "Desired State",
  }[type] ?? "Change";
}

function operationValue(operation: Record<string, unknown>) {
  if (operation.type === "set_desired_state") return String(operation.summary);
  if (operation.type === "create_open_question") return String(operation.question);
  return String(operation.title ?? operation.summary ?? "");
}
