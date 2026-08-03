"use client";

import {
  ArrowRight,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { startMyDayAction } from "@/app/(app)/today/actions";
import type { NewDayBriefing as Briefing } from "@/lib/clarity/new-day-briefing";
import {
  formatFullLocalDate,
  formatWeekday,
  getDayPeriod,
  getLocalDate,
} from "@/lib/clarity/date-time";
import { PendingButton } from "./pending-button";

export function NewDayBriefing({
  briefing,
  currentLocalDate,
  timezone,
  initialNow,
}: {
  briefing: Briefing;
  currentLocalDate: string;
  timezone: string;
  initialNow: string;
}) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const router = useRouter();
  const refreshedForDate = useRef<string | null>(null);

  useEffect(() => {
    const refreshNow = () => setNow(new Date());
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshNow();
      }
    };
    const interval = window.setInterval(refreshNow, 30_000);

    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener(
        "visibilitychange",
        refreshWhenVisible,
      );
    };
  }, []);

  const liveLocalDate = getLocalDate(timezone, now);
  const currentDay = formatWeekday(liveLocalDate);
  const heading = `Are you starting ${currentDay} now?`;
  const fullLocalDate = formatFullLocalDate(liveLocalDate);
  const previousDay = formatWeekday(briefing.previousLocalDate);
  const summary = previousDaySummary(briefing, previousDay);
  const daypart = daypartPresentation(getDayPeriod(timezone, now));
  const DaypartIcon = daypart.icon;
  const localTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  useEffect(() => {
    if (
      liveLocalDate !== currentLocalDate &&
      refreshedForDate.current !== liveLocalDate
    ) {
      refreshedForDate.current = liveLocalDate;
      router.refresh();
    }
  }, [currentLocalDate, liveLocalDate, router]);

  return (
    <section className="w-full min-w-0 max-w-full space-y-10 pt-[clamp(2rem,7svh,4.5rem)]">
      <div className="space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Today
        </p>
        <p
          className="text-sm leading-6 text-muted-foreground"
          suppressHydrationWarning
        >
          {fullLocalDate} · {localTime}
        </p>
        <div className="clarity-greeting-enter flex min-h-7 items-center gap-2 text-[var(--clarity-completed)]">
          <DaypartIcon className="size-5" aria-hidden="true" />
          <p className="text-sm font-semibold">{daypart.greeting}</p>
        </div>
        <h1
          className="clarity-heading-enter text-3xl font-semibold tracking-[-0.045em]"
          suppressHydrationWarning
        >
          {heading}
        </h1>
        {summary && (
          <p className="text-sm text-muted-foreground">{summary}</p>
        )}
      </div>

      <div className="space-y-3">
        <form action={startMyDayAction}>
          <PendingButton
            type="submit"
            size="lg"
            pendingLabel={`Starting ${currentDay}…`}
            className="h-12 w-full rounded-xl text-base"
          >
            Start {currentDay} now
            <ArrowRight />
          </PendingButton>
        </form>

        <div className="space-y-1 text-center">
          <Link
            href="/calendar"
            className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            I&apos;m planning ahead
          </Link>
          <p className="text-xs leading-5 text-muted-foreground">
            Opens Calendar without starting {currentDay}.
          </p>
        </div>
      </div>
    </section>
  );
}

function daypartPresentation(
  period: ReturnType<typeof getDayPeriod>,
): { greeting: string; icon: LucideIcon } {
  switch (period) {
    case "morning":
      return { greeting: "Good morning", icon: Sunrise };
    case "afternoon":
      return { greeting: "Good afternoon", icon: Sun };
    case "evening":
      return { greeting: "Good evening", icon: Sunset };
    case "late_night":
      return { greeting: "Late night", icon: Moon };
  }
}

function previousDaySummary(
  briefing: Briefing,
  previousDay: string,
) {
  const counts = [
    briefing.completedCount > 0
      ? `${briefing.completedCount} completed`
      : null,
    briefing.movedCount > 0 ? `${briefing.movedCount} moved` : null,
    briefing.droppedCount > 0
      ? `${briefing.droppedCount} dropped`
      : null,
  ].filter((value): value is string => Boolean(value));

  return counts.length > 0
    ? `${previousDay}: ${counts.join(" · ")}`
    : null;
}
