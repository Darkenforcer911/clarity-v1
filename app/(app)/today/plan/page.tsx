import { Suspense } from "react";

import { PageLoading } from "@/components/clarity/page-loading";
import { ProposedPlan } from "@/components/clarity/proposed-plan";
import {
  loadTodayForRoute,
  redirectFromPlan,
} from "../route-guards";

export default function ProposedPlanPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ProposedPlanContent />
    </Suspense>
  );
}

async function ProposedPlanContent() {
  const data = await loadTodayForRoute();
  redirectFromPlan(data);

  if (!data.plan) {
    return null;
  }

  return (
    <ProposedPlan
      plan={data.plan}
      actions={data.actions.filter((action) => action.status === "proposed")}
      profile={data.profile}
    />
  );
}
