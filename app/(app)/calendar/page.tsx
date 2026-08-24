import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CalendarAgenda } from "@/components/clarity/calendar-agenda";
import { PageLoading } from "@/components/clarity/page-loading";
import {
  AuthenticationRequiredError,
} from "@/lib/clarity/daily-loop-queries";
import { getCalendarPageData } from "@/lib/clarity/calendar-service";

export default function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <CalendarContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CalendarContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let data;

  try {
    data = await getCalendarPageData(
      typeof query.date === "string" ? query.date : undefined,
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/auth/login");
    throw error;
  }

  return (
    <CalendarAgenda
      key={data.selectedDate}
      {...data}
      timezone={data.profile.timezone}
      initialNow={new Date().toISOString()}
      initialCommitmentId={
        typeof query.commitment === "string" ? query.commitment : undefined
      }
    />
  );
}
