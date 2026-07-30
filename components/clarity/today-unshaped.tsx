import { ArrowRight, Sunrise } from "lucide-react";

import { startMyDayAction } from "@/app/(app)/today/actions";
import { PendingButton } from "./pending-button";

export function TodayUnshaped() {
  return (
    <section>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-secondary text-[var(--clarity-completed)]">
          <Sunrise className="size-6" />
        </div>
        <h2 className="max-w-md text-2xl font-semibold tracking-[-0.035em]">
          Your day hasn&apos;t been shaped yet.
        </h2>
        <p className="mt-3 max-w-md leading-7 text-muted-foreground">
          Give Clarity a few anchors and get a focused, realistic plan for
          today.
        </p>
        <form action={startMyDayAction} className="mt-8">
          <PendingButton
            type="submit"
            size="lg"
            pendingLabel="Opening Shape Today…"
            className="h-12 w-full rounded-xl text-base sm:w-auto"
          >
            Start my day
            <ArrowRight />
          </PendingButton>
        </form>
      </div>
    </section>
  );
}
