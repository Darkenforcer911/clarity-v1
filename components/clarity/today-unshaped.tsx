import { ArrowRight, Sunrise } from "lucide-react";

import { startMyDayAction } from "@/app/(app)/today/actions";
import { PendingButton } from "./pending-button";

export function TodayUnshaped() {
  return (
    <section>
      <div className="rounded-3xl border border-sky-200/15 bg-[#0c2b62]/90 p-6 shadow-sm sm:p-8">
        <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-sky-300/10 text-[#38a5ff]">
          <Sunrise className="size-6" />
        </div>
        <h2 className="max-w-md text-2xl font-semibold tracking-[-0.035em]">
          Your day hasn&apos;t been shaped yet.
        </h2>
        <p className="mt-3 max-w-md leading-7 text-blue-100/60">
          Give Clarity a few anchors and get a focused, realistic plan for
          today.
        </p>
        <form action={startMyDayAction} className="mt-8">
          <PendingButton
            type="submit"
            size="lg"
            pendingLabel="Opening Shape Today…"
            className="h-12 w-full rounded-xl bg-[#148bff] text-base hover:bg-[#0877e0] sm:w-auto"
          >
            Start my day
            <ArrowRight />
          </PendingButton>
        </form>
      </div>
    </section>
  );
}
