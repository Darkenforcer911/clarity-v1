import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LifeModelView } from "@/components/clarity/life-model-view";
import { PageLoading } from "@/components/clarity/page-loading";
import {
  AuthenticationRequiredError,
} from "@/lib/clarity/daily-loop-queries";
import { getLifePageModel } from "@/lib/clarity/life-model-service";

export default function LifeModelPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LifeModelContent />
    </Suspense>
  );
}

async function LifeModelContent() {
  let pageModel;

  try {
    pageModel = await getLifePageModel();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/auth/login");
    throw error;
  }

  return (
    <LifeModelView
      model={pageModel.life}
      projection={pageModel.projection}
    />
  );
}
