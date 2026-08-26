import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AddToLifeFlow } from "@/components/clarity/add-to-life-flow";
import { PageLoading } from "@/components/clarity/page-loading";
import { AuthenticationRequiredError } from "@/lib/clarity/daily-loop-queries";
import { getLifeModel } from "@/lib/clarity/life-model-service";

export default function AddToLifePage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <AddToLifeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AddToLifeContent({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  let model;
  try {
    model = await getLifeModel();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/auth/login");
    throw error;
  }

  const { intent } = await searchParams;
  return (
    <AddToLifeFlow
      areas={model.areas.map(({ id, name }) => ({ id, name }))}
      initialIntent={typeof intent === "string" ? intent.slice(0, 2000) : ""}
    />
  );
}
