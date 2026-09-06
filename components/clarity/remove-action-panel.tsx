"use client";

import { Trash2, X } from "lucide-react";
import { useActionState, useEffect } from "react";

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
  currentDate = true,
  onRemoved,
}: {
  actionId: string;
  onClose: () => void;
  occurrenceOnly?: boolean;
  actionTitle?: string;
  skipToday?: boolean;
  currentDate?: boolean;
  onRemoved?: () => void;
}) {
  const [state, formAction] = useActionState(
    occurrenceOnly ? removeActionOccurrenceAction : removeActionFromTodayAction,
    {
    success: false,
    error: null,
    actionId: null,
    },
  );

  useEffect(() => {
    if (state.success) onRemoved?.();
  }, [onRemoved, state.success]);

  return (
    <section className="rounded-2xl bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {skipToday
              ? currentDate
                ? `Skip “${actionTitle ?? "this Action"}” today?`
                : `Skip “${actionTitle ?? "this Action"}” on this date?`
              : occurrenceOnly
                ? "Remove this Action?"
                : "Remove from today?"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {skipToday
              ? "Only this dated occurrence is skipped. Future occurrences continue."
              : occurrenceOnly
              ? "This removes only this dated occurrence. A repeating Action will continue on future dates."
              : "This removes the action without marking it complete."}
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
        <PendingButton
          type="submit"
          variant="destructive"
          pendingLabel="Removing…"
          className="h-11 rounded-xl"
        >
          <Trash2 />
          {skipToday
            ? currentDate
              ? "Skip today"
              : "Skip this occurrence"
            : occurrenceOnly
              ? currentDate
                ? "Remove from today"
                : "Remove this occurrence"
              : "Remove from today"}
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
