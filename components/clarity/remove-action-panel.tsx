"use client";

import { Trash2, X } from "lucide-react";
import { useActionState } from "react";

import {
  removeActionFromTodayAction,
  removeActionOccurrenceAction,
} from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import { PendingButton } from "./pending-button";

export function RemoveActionPanel({
  actionId,
  onClose,
  occurrenceOnly = false,
  actionTitle,
  skipToday = false,
  returnTo,
}: {
  actionId: string;
  onClose: () => void;
  occurrenceOnly?: boolean;
  actionTitle?: string;
  skipToday?: boolean;
  returnTo: string;
}) {
  const [state, formAction] = useActionState(
    occurrenceOnly ? removeActionOccurrenceAction : removeActionFromTodayAction,
    {
    success: false,
    error: null,
    actionId: null,
    },
  );

  return (
    <section className="rounded-2xl bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {skipToday
              ? `Skip ${actionTitle ?? "this Action"}?`
              : `Remove ${actionTitle ?? "this Action"}?`}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {skipToday
              ? "Only this date will be skipped. Future repeats will continue."
              : "This will remove it from your plan without marking it complete."}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Cancel removing action"
          className="rounded-xl"
        >
          <X />
        </Button>
      </div>
      <form action={formAction} className="mt-5 grid gap-2">
        <input type="hidden" name="actionId" value={actionId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <PendingButton
          type="submit"
          variant="destructive"
          pendingLabel={skipToday ? "Skipping…" : "Removing…"}
          className="h-11 rounded-xl"
        >
          <Trash2 />
          {skipToday ? "Skip" : "Remove"}
        </PendingButton>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="h-11 rounded-xl"
        >
          Cancel
        </Button>
        {state.error && (
          <p role="alert" className="text-sm leading-6 text-destructive">
            {state.error}
          </p>
        )}
      </form>
    </section>
  );
}
