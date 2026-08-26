import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { LifeProposalReview } from "@/components/clarity/life-proposal-review";
import { PageLoading } from "@/components/clarity/page-loading";
import { AuthenticationRequiredError } from "@/lib/clarity/daily-loop-queries";
import { getLifeModel } from "@/lib/clarity/life-model-service";
import { getLifeModelChangeProposal } from "@/lib/clarity/life-model-proposal-service";

export default function LifeProposalPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LifeProposalContent params={params} />
    </Suspense>
  );
}

async function LifeProposalContent({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  if (!z.string().uuid().safeParse(proposalId).success) notFound();

  let proposal;
  let model;
  try {
    [proposal, model] = await Promise.all([
      getLifeModelChangeProposal(proposalId),
      getLifeModel(),
    ]);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/auth/login");
    throw error;
  }

  return (
    <LifeProposalReview
      proposal={proposal}
      areaNames={Object.fromEntries(model.areas.map((area) => [area.id, area.name]))}
    />
  );
}
