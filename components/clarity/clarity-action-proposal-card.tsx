"use client";

import { Check, Pencil, X } from "lucide-react";
import { useActionState, useState } from "react";

import {
  confirmClarityActionProposalAction,
  dismissClarityProposalAction,
  editClarityActionProposalAction,
} from "@/app/(app)/clarity/proposal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialClarityProposalActionState } from "@/lib/clarity/ai/clarity-proposal-action-state";
import {
  clarityActionProposalPlacementCopy,
  formatClarityActionProposalDue,
  type ClarityActionCreateProposal,
} from "@/lib/clarity/ai/clarity-proposal";
import { formatDuration } from "@/lib/clarity/duration";
import { PendingButton } from "./pending-button";

export function ClarityActionProposalCard({
  proposal,
  profileLocalDate,
}: {
  proposal: ClarityActionCreateProposal;
  profileLocalDate: string;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [dueLocalDate, setDueLocalDate] = useState(
    proposal.dueLocalDate ?? "",
  );
  const [dueLocalTime, setDueLocalTime] = useState(
    proposal.dueLocalTime ?? "",
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    proposal.estimatedMinutes?.toString() ?? "",
  );
  const [confirmState, confirmAction] = useActionState(
    confirmClarityActionProposalAction,
    initialClarityProposalActionState,
  );
  const [editState, editAction] = useActionState(
    editClarityActionProposalAction,
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
      <ResolvedActionProposalCard
        proposal={proposal}
        profileLocalDate={profileLocalDate}
      />
    );
  }

  const placementCopy = clarityActionProposalPlacementCopy(
    proposal.dueLocalDate,
    profileLocalDate,
  );

  return (
    <aside
      data-clarity-action-proposal
      data-proposal-status={proposal.status}
      className="max-w-[94%] rounded-2xl border border-border bg-card p-3.5 text-sm shadow-sm"
    >
      <div className="space-y-1">
        <p className="font-semibold">{placementCopy.proposed}</p>
        {proposal.rationale && (
          <p className="text-xs leading-5 text-muted-foreground">
            {proposal.rationale}
          </p>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-secondary px-3 py-2.5">
        <p className="font-medium leading-5">{proposal.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {actionMeta(proposal)}
        </p>
      </div>

      {proposal.status === "execution_failed" && (
        <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Clarity couldn’t add this Action. Nothing was created, and you can retry.
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
          <input type="hidden" name="expectedRevision" value={proposal.revision} />
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Action
            </span>
            <Input
              name="title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              maxLength={200}
              className="h-10 rounded-xl"
              required
            />
          </label>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Due date
              </span>
              <Input
                name="dueLocalDate"
                type="date"
                value={dueLocalDate}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDueLocalDate(value);
                  if (!value) setDueLocalTime("");
                }}
                className="h-10 min-w-0 rounded-xl"
              />
            </label>
            <label className="min-w-0 space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Due time
              </span>
              <Input
                name="dueLocalTime"
                type="time"
                value={dueLocalTime}
                onChange={(event) => setDueLocalTime(event.currentTarget.value)}
                disabled={!dueLocalDate}
                className="h-10 min-w-0 rounded-xl"
              />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Estimated minutes
            </span>
            <Input
              name="estimatedMinutes"
              type="number"
              min={1}
              max={1440}
              inputMode="numeric"
              value={estimatedMinutes}
              onChange={(event) => setEstimatedMinutes(event.currentTarget.value)}
              className="h-10 rounded-xl"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => {
                setTitle(proposal.title);
                setDueLocalDate(proposal.dueLocalDate ?? "");
                setDueLocalTime(proposal.dueLocalTime ?? "");
                setEstimatedMinutes(proposal.estimatedMinutes?.toString() ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <PendingButton type="submit" pendingLabel="Saving…" className="h-10 rounded-xl">
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
              pendingLabel="Adding…"
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

function ResolvedActionProposalCard({
  proposal,
  profileLocalDate,
}: {
  proposal: ClarityActionCreateProposal;
  profileLocalDate: string;
}) {
  const placementCopy = clarityActionProposalPlacementCopy(
    proposal.dueLocalDate,
    profileLocalDate,
  );
  const label = proposal.status === "executed"
    ? placementCopy.executed
    : proposal.status === "dismissed"
      ? "Not now"
      : "Action proposal expired";
  const detail = proposal.status === "executed"
    ? [proposal.title, actionMeta(proposal)].filter(Boolean).join(" · ")
    : proposal.status === "dismissed"
      ? "No Action was created."
      : "This proposal is no longer current.";

  return (
    <aside
      data-clarity-action-proposal
      data-proposal-status={proposal.status}
      className="max-w-[94%] rounded-2xl border border-border bg-card px-3.5 py-3 text-sm"
    >
      <p className="font-semibold">{label}</p>
      <p className="mt-1 leading-5 text-muted-foreground">{detail}</p>
    </aside>
  );
}

function actionMeta(proposal: ClarityActionCreateProposal) {
  return [
    formatClarityActionProposalDue(proposal),
    proposal.estimatedMinutes
      ? `~${formatDuration(proposal.estimatedMinutes)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ") || "Flexible";
}
