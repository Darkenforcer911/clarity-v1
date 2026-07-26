import { Suspense } from "react";

import { DailyContextCards } from "@/components/clarity/daily-context-cards";
import { PageLoading } from "@/components/clarity/page-loading";
import { ShapeTodayForm } from "@/components/clarity/shape-today-form";
import {
  loadTodayForRoute,
  redirectFromShape,
} from "../route-guards";

export default function ShapeTodayPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ShapeTodayContent />
    </Suspense>
  );
}

async function ShapeTodayContent() {
  const data = await loadTodayForRoute();
  redirectFromShape(data);

  return (
    <section className="space-y-7">
      <div className="space-y-3">
        <p className="text-sm font-medium text-blue-100/60">Shape Today</p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          A few anchors for today.
        </h1>
        <p className="max-w-xl leading-7 text-blue-100/60">
          Clarity will use these details to build a focused plan that fits the
          day you actually have.
        </p>
      </div>
      <DailyContextCards
        rescheduledActions={data.rescheduledContext}
        yesterdayRecord={data.yesterdayRecord}
      />
      <ShapeTodayForm />
    </section>
  );
}
