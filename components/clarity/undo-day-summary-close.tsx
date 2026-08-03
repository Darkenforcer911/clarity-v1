"use client";

import { useActionState, useState } from "react";

import { undoCloseDayFromSummaryAction } from "@/app/(app)/today/actions";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { Button } from "@/components/ui/button";
import { PendingButton } from "./pending-button";
import { useCurrentLocalDate } from "./use-current-local-date";

export function UndoDaySummaryClose({
  planId,
  day,
  localDate,
  timezone,
}: {
  planId: string;
  day: string;
  localDate: string;
  timezone: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(
    undoCloseDayFromSummaryAction,
    initialDailyLoopActionState,
  );
  const currentLocalDate = useCurrentLocalDate(timezone, localDate);

  if (currentLocalDate !== localDate) {
    return null;
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="h-11 w-full rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        Undo close
      </Button>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="font-semibold">Reopen {day}?</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          You can add or update actions, then close the day again.
        </p>
      </div>
      <form action={formAction} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="planId" value={planId} />
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirming(false)}
          className="h-11 rounded-xl"
        >
          Cancel
        </Button>
        <PendingButton
          type="submit"
          pendingLabel="Reopening…"
          className="h-11 rounded-xl"
        >
          Reopen {day}
        </PendingButton>
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </section>
  );
}
