"use client";

import { Check, Circle } from "lucide-react";
import { startTransition, useOptimistic, useState } from "react";

import { setActionCompletionAction } from "@/app/(app)/today/actions";
import { Button } from "@/components/ui/button";

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
  const [optimisticCompleted, setOptimisticCompleted] = useOptimistic(
    completed,
    (_current, next: boolean) => next,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateCompletion(nextCompleted: boolean) {
    const formData = new FormData();
    formData.set("actionId", actionId);
    formData.set("completed", String(nextCompleted));
    setPending(true);
    setError(null);

    startTransition(async () => {
      setOptimisticCompleted(nextCompleted);

      try {
        await setActionCompletionAction(formData);
      } catch {
        setError(
          nextCompleted
            ? "Couldn’t complete the action. Try again."
            : "Couldn’t mark the action incomplete. Try again.",
        );
      } finally {
        setPending(false);
      }
    });
  }

  if (!optimisticCompleted) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          size="lg"
          disabled={pending}
          onClick={() => updateCompletion(true)}
          className="h-12 w-full rounded-xl text-base"
        >
          <Check />
          {pending ? "Completing…" : "Complete"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled={pending}
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
            <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirmingIncomplete(false);
                  updateCompletion(false);
                }}
                className="h-11 w-full rounded-xl"
              >
                {pending ? "Marking incomplete…" : "Mark incomplete"}
              </Button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
