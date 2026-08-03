import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageLoading } from "@/components/clarity/page-loading";
import { dailyLoopService } from "@/lib/clarity/daily-loop-service";
import {
  loadTodayForRoute,
  redirectFromShape,
} from "../route-guards";

export default function ShapeTodayPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ShapeTodayRedirect />
    </Suspense>
  );
}

async function ShapeTodayRedirect() {
  const data = await loadTodayForRoute();
  redirectFromShape(data);

  await dailyLoopService.ensureInitialPlanProposal();
  redirect("/today/plan");

  return null;
}
