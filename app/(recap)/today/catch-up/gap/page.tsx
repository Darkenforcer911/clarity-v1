import { redirect } from "next/navigation";
import { Suspense } from "react";

import { loadTodayForRoute } from "@/app/(app)/today/route-guards";
import { AppShell } from "@/components/clarity/app-shell";
import { PageLoading } from "@/components/clarity/page-loading";
import { ReturnGapContext } from "@/components/clarity/return-gap-context";

export default function ReturnGapPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <PageLoading />
        </AppShell>
      }
    >
      <ReturnGapContent />
    </Suspense>
  );
}

async function ReturnGapContent() {
  const data = await loadTodayForRoute();

  if (data.previousDayTransition?.kind === "wrap_up") {
    redirect("/today/catch-up");
  }

  if (!data.pendingReturnGap) {
    redirect("/today");
  }

  return (
    <AppShell>
      <ReturnGapContext
        gap={data.pendingReturnGap}
        timezone={data.profile.timezone}
        currentLocalDate={data.localDate}
      />
    </AppShell>
  );
}
