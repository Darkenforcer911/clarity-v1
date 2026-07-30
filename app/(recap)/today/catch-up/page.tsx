import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/clarity/app-shell";
import { PageLoading } from "@/components/clarity/page-loading";
import { PreviousDayCatchUp } from "@/components/clarity/previous-day-catch-up";
import { loadTodayForRoute } from "@/app/(app)/today/route-guards";

export default function CatchUpPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <PageLoading />
        </AppShell>
      }
    >
      <CatchUpContent />
    </Suspense>
  );
}

async function CatchUpContent() {
  const data = await loadTodayForRoute();
  const transition = data.previousDayTransition;

  if (!transition || transition.kind !== "wrap_up") {
    if (data.pendingReturnGap) {
      redirect("/today/catch-up/gap");
    }

    redirect("/today");
  }

  return (
    <PreviousDayCatchUp
      transition={transition}
      timezone={data.profile.timezone}
      currentLocalDate={data.localDate}
    />
  );
}
