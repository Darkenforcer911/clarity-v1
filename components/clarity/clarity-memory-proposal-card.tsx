"use client";

import { Check, Pencil, X } from "lucide-react";
import { useActionState, useState } from "react";

import {
  confirmClarityMemoryProposalAction,
  dismissClarityProposalAction,
  editClarityMemoryProposalAction,
} from "@/app/(app)/clarity/proposal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialClarityProposalActionState } from "@/lib/clarity/ai/clarity-proposal-action-state";
import {
  formatClarityProposalEffectiveDate,
  type ClarityMemoryUpdateProposal,
} from "@/lib/clarity/ai/clarity-proposal";
import { PendingButton } from "./pending-button";

export function ClarityMemoryProposalCard({
  proposal,
}: {
  proposal: ClarityMemoryUpdateProposal;
}) {
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(proposal.replacementStatement);
  const [effectiveOn, setEffectiveOn] = useState(proposal.effectiveOn ?? "");
  const [confirmState, confirmAction] = useActionState(
    confirmClarityMemoryProposalAction,
    initialClarityProposalActionState,
  );
  const [editState, editAction] = useActionState(
    editClarityMemoryProposalAction,
    initialClarityProposalActionState,
  );
  const [dismissState, dismissAction] = useActionState(
    dismissClarityProposalAction,
    initialClarityProposalActionState,
  );

  const error = [confirmState, editState, dismissState].find(
    (state) => state.status === "error",
  )?.message;

  if (proposal.status !== "proposed" && proposal.status !== "execution_failed") {
    return (
      <ResolvedProposalCard proposal={proposal} />
    );
  }

  return (
    <aside
      data-clarity-memory-proposal
      data-proposal-status={proposal.status}
      className="max-w-[94%] rounded-2xl border border-border bg-card p-3.5 text-sm shadow-sm"
    >
      <div className="space-y-1">
        <p className="font-semibold">Update what I know?</p>
        {proposal.rationale && (
          <p className="text-xs leading-5 text-muted-foreground">
            {proposal.rationale}
          </p>
        )}
      </div>

      <dl className="mt-3 grid gap-2">
        <ProposalChange
          label="Add"
          value={proposal.replacementStatement}
          detail={effectiveDateLabel(proposal.effectiveOn)}
        />
        <ProposalChange label="Retire" value={proposal.targetStatement} />
      </dl>

      {proposal.status === "execution_failed" && (
        <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Clarity couldn’t apply this update. Nothing changed, and you can retry.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}

      {editing ? (
        <form action={editAction} className="mt-3 space-y-3 border-t border-border pt-3">
          <input type="hidden" name="proposalId" value={proposal.id} />
          <input
            type="hidden"
            name="expectedRevision"
            value={proposal.revision}
          />
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              What changed
            </span>
            <Textarea
              name="replacementStatement"
              value={statement}
              onChange={(event) => setStatement(event.currentTarget.value)}
              maxLength={1000}
              className="min-h-20 resize-none rounded-xl"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Effective date
            </span>
            <Input
              name="effectiveOn"
              type="date"
              value={effectiveOn}
              onChange={(event) => setEffectiveOn(event.currentTarget.value)}
              className="h-10 rounded-xl"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => {
                setStatement(proposal.replacementStatement);
                setEffectiveOn(proposal.effectiveOn ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <PendingButton
              type="submit"
              pendingLabel="Saving…"
              className="h-10 rounded-xl"
            >
              Save
            </PendingButton>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2">
          <form action={confirmAction}>
            <input type="hidden" name="proposalId" value={proposal.id} />
            <PendingButton
              type="submit"
              size="sm"
              pendingLabel="Applying…"
              className="h-9 rounded-xl px-3"
            >
              <Check className="size-4" />
              {proposal.status === "execution_failed" ? "Retry" : "Confirm"}
            </PendingButton>
          </form>
          {proposal.status === "proposed" && (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9 rounded-xl px-3"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" /> Edit
              </Button>
              <form action={dismissAction}>
                <input type="hidden" name="proposalId" value={proposal.id} />
                <PendingButton
                  type="submit"
                  size="sm"
                  variant="ghost"
                  pendingLabel="Dismissing…"
                  className="h-9 rounded-xl px-3 text-muted-foreground"
                >
                  <X className="size-4" /> Not now
                </PendingButton>
              </form>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function ProposalChange({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2.5">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 leading-5">{value}</dd>
      {detail && (
        <dd className="mt-1 text-xs text-muted-foreground">{detail}</dd>
      )}
    </div>
  );
}

function ResolvedProposalCard({
  proposal,
}: {
  proposal: ClarityMemoryUpdateProposal;
}) {
  const label = proposal.status === "executed"
    ? "Updated"
    : proposal.status === "dismissed"
      ? "Not now"
      : "Update expired";
  const detail = proposal.status === "executed"
    ? [proposal.replacementStatement, effectiveDateLabel(proposal.effectiveOn)]
        .filter(Boolean)
        .join(" · ")
    : proposal.status === "dismissed"
      ? "Clarity left your Memory unchanged."
      : "What Clarity knew changed before this could be applied.";

  return (
    <aside
      data-clarity-memory-proposal
      data-proposal-status={proposal.status}
      className="max-w-[94%] rounded-2xl border border-border bg-card px-3.5 py-3 text-sm"
    >
      <p className="font-semibold">{label}</p>
      <p className="mt-1 leading-5 text-muted-foreground">{detail}</p>
    </aside>
  );
}

function effectiveDateLabel(effectiveOn: string | null) {
  const formatted = formatClarityProposalEffectiveDate(effectiveOn);
  return formatted ? `Effective ${formatted}` : null;
}
