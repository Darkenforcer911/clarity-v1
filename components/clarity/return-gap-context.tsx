"use client";

import { useActionState } from "react";

import { recordReturnGapAction } from "@/app/(app)/today/day-transition-actions";
import { initialDayTransitionActionState } from "@/lib/clarity/day-transition-state";
import type { PendingReturnGap } from "@/lib/clarity/daily-loop-queries";
import { PendingButton } from "./pending-button";

export function ReturnGapContext({
  gap,
}: {
  gap: PendingReturnGap;
}) {
  const [state, formAction] = useActionState(
    recordReturnGapAction,
    initialDayTransitionActionState,
  );
  return (
    <section className="space-y-8 pt-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Today
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Catch up
        </h1>
        <p className="max-w-md leading-6 text-muted-foreground">
          It&apos;s been {gap.dayCount}{" "}
          {gap.dayCount === 1 ? "day" : "days"}. Let&apos;s pick up
          from where you are now.
        </p>
      </header>

      <form action={formAction}>
        {state.error && (
          <p
            role="alert"
            className="mb-3 rounded-xl bg-secondary px-4 py-3 text-sm"
          >
            {state.error}
          </p>
        )}

        <PendingButton
          type="submit"
          pendingLabel="Continuing…"
          className="h-12 w-full rounded-xl text-base"
        >
          Continue to today
        </PendingButton>
      </form>
    </section>
  );
}
