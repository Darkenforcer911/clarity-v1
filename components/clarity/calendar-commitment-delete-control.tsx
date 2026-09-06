"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect } from "react";

import { deleteCalendarCommitmentAction } from "@/app/(app)/calendar/actions";
import { Button } from "@/components/ui/button";
import { initialCalendarActionState } from "@/lib/clarity/calendar-action-state";
import type { CalendarCommitment } from "@/lib/clarity/calendar-commitments";
import { PendingButton } from "./pending-button";

export function CalendarCommitmentDeleteControl({
  commitment,
  confirming,
  onConfirmingChange,
  onSaved,
  showTrigger = true,
  triggerLabel,
}: {
  commitment: Pick<CalendarCommitment, "id" | "commitment_type">;
  confirming: boolean;
  onConfirmingChange: (confirming: boolean) => void;
  onSaved: () => void;
  showTrigger?: boolean;
  triggerLabel?: string;
}) {
  const [deleteState, deleteAction] = useActionState(
    deleteCalendarCommitmentAction,
    initialCalendarActionState,
  );
  const noun = commitment.commitment_type === "event" ? "event" : "deadline";

  useEffect(() => {
    if (!deleteState.saved) return;
    onConfirmingChange(false);
    onSaved();
  }, [deleteState.saved, deleteState.version, onConfirmingChange, onSaved]);

  if (!confirming) {
    return showTrigger ? (
      <Button
        type="button"
        variant="outline"
        onClick={() => onConfirmingChange(true)}
        className="h-11 w-full rounded-xl"
      >
        <Trash2 />
        {triggerLabel ?? `Delete ${noun}`}
      </Button>
    ) : null;
  }

  return (
    <div className="space-y-3 rounded-xl bg-secondary p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Delete this {noun}?</p>
        <p className="text-xs leading-5 text-muted-foreground">
          This removes its recorded outcome too.
        </p>
      </div>
      <form action={deleteAction} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="commitmentId" value={commitment.id} />
        <Button
          type="button"
          variant="ghost"
          onClick={() => onConfirmingChange(false)}
        >
          Keep
        </Button>
        <PendingButton
          type="submit"
          variant="destructive"
          pendingLabel="Deleting…"
        >
          Delete
        </PendingButton>
      </form>
      {deleteState.error && (
        <p role="alert" className="text-xs text-destructive">
          {deleteState.error}
        </p>
      )}
    </div>
  );
}
