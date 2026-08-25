import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LifeModelView } from "@/components/clarity/life-model-view";
import { PageLoading } from "@/components/clarity/page-loading";
import {
  AuthenticationRequiredError,
} from "@/lib/clarity/daily-loop-queries";
import { getLifeModel } from "@/lib/clarity/life-model-service";

export default function LifeModelPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LifeModelContent />
    </Suspense>
  );
}

async function LifeModelContent() {
  let model;

  try {
    model = await getLifeModel();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/auth/login");
    throw error;
  }

  return <LifeModelView model={model} />;
}
