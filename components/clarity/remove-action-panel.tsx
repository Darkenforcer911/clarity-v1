"use client";

import { Trash2, X } from "lucide-react";

import { removeActionFromTodayAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import { PendingButton } from "./pending-button";

export function RemoveActionPanel({
  actionId,
  onClose,
}: {
  actionId: string;
  onClose: () => void;
}) {
  return (
    <section className="rounded-2xl bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Remove from today?</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This removes the action without marking it complete.
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
      <form action={removeActionFromTodayAction} className="mt-5 grid gap-2">
        <input type="hidden" name="actionId" value={actionId} />
        <PendingButton
          type="submit"
          variant="destructive"
          pendingLabel="Removing…"
          className="h-11 rounded-xl"
        >
          <Trash2 />
          Remove from today
        </PendingButton>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="h-11 rounded-xl"
        >
          Cancel
        </Button>
      </form>
    </section>
  );
}
