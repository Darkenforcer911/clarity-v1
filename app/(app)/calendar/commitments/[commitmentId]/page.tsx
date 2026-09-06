import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { CalendarCommitmentDetail } from "@/components/clarity/calendar-commitment-detail";
import { PageLoading } from "@/components/clarity/page-loading";
import {
  CalendarCommitmentNotFoundError,
  getCalendarCommitmentContext,
} from "@/lib/clarity/calendar-service";
import { AuthenticationRequiredError } from "@/lib/clarity/daily-loop-queries";
import { getLocalDate } from "@/lib/clarity/date-time";

export default function CalendarCommitmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ commitmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <CalendarCommitmentContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CalendarCommitmentContent({
  params,
  searchParams,
}: {
  params: Promise<{ commitmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ commitmentId }, query] = await Promise.all([params, searchParams]);
  const localDate = firstQueryValue(query.date);

  if (!localDate) notFound();

  let context;
  try {
    context = await getCalendarCommitmentContext(
      commitmentId,
      localDate,
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/auth/login");
    if (error instanceof CalendarCommitmentNotFoundError) notFound();
    throw error;
  }

  return (
    <CalendarCommitmentDetail
      commitment={context.commitment}
      today={getLocalDate(context.profile.timezone)}
      timezone={context.profile.timezone}
      initialNow={new Date().toISOString()}
    />
  );
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
