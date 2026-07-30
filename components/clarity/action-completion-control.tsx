"use client";

import { Check, Circle } from "lucide-react";
import { useState } from "react";

import {
  markActionIncompleteAction,
  setActionCompletionAction,
} from "@/app/(app)/today/actions";
import { Button } from "@/components/ui/button";
import { PendingButton } from "./pending-button";

export function ActionCompletionControl({
  actionId,
  completed,
  completionTime,
}: {
  actionId: string;
  completed: boolean;
  completionTime: string | null;
}) {
  const [confirmingIncomplete, setConfirmingIncomplete] = useState(false);

  if (!completed) {
    return (
      <form action={setActionCompletionAction}>
        <input type="hidden" name="actionId" value={actionId} />
        <input type="hidden" name="completed" value="true" />
        <PendingButton
          type="submit"
          size="lg"
          pendingLabel="Completing…"
          className="h-12 w-full rounded-xl text-base"
        >
          <Check />
          Complete
        </PendingButton>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        variant="outline"
        className="h-12 w-full rounded-xl text-base"
        onClick={() => setConfirmingIncomplete(true)}
      >
        <Circle />
        Mark incomplete
      </Button>

      {confirmingIncomplete && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <p className="font-semibold">Mark this action incomplete?</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {completionTime
              ? `Its completion time of ${completionTime} will be removed.`
              : "Its recorded completion will be removed."}
          </p>
          <div className="mt-4 grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setConfirmingIncomplete(false)}
            >
              Keep completed
            </Button>
            <form action={markActionIncompleteAction}>
              <input type="hidden" name="actionId" value={actionId} />
              <input type="hidden" name="returnTo" value="detail" />
              <PendingButton
                type="submit"
                pendingLabel="Marking incomplete…"
                className="h-11 w-full rounded-xl"
              >
                Mark incomplete
              </PendingButton>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
