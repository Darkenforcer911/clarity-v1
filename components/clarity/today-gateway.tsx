"use client";

import {
  ArrowRight,
  CalendarDays,
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
import type { TodayGatewayPrimaryAction } from "@/lib/clarity/today-gateway";
import {
  formatFullLocalDate,
  getDayPeriod,
  getLocalDate,
} from "@/lib/clarity/date-time";
import { Button } from "@/components/ui/button";
import { PendingButton } from "./pending-button";

export function TodayGateway({
  primaryAction,
  currentLocalDate,
  timezone,
  initialNow,
}: {
  primaryAction: TodayGatewayPrimaryAction;
  currentLocalDate: string;
  timezone: string;
  initialNow: string;
}) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const router = useRouter();
  const refreshedForDate = useRef<string | null>(null);
  const lastForegroundRefreshAt = useRef(0);
  const liveLocalDate = getLocalDate(timezone, now);
  const fullLocalDate = formatFullLocalDate(liveLocalDate);
  const daypart = daypartPresentation(getDayPeriod(timezone, now));
  const DaypartIcon = daypart.icon;
  const localTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  useEffect(() => {
    const refreshClock = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
      }
    };
    const refreshGateway = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      refreshClock();

      const refreshedAt = Date.now();
      if (refreshedAt - lastForegroundRefreshAt.current > 1_000) {
        lastForegroundRefreshAt.current = refreshedAt;
        router.refresh();
      }
    };
    const interval = window.setInterval(refreshClock, 30_000);

    window.addEventListener("focus", refreshGateway);
    document.addEventListener("visibilitychange", refreshGateway);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshGateway);
      document.removeEventListener("visibilitychange", refreshGateway);
    };
  }, [router]);

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
    <section className="w-full min-w-0 max-w-md pt-3 sm:pt-1">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Today
        </p>
        <div className="clarity-greeting-enter mt-3 flex min-h-7 items-center gap-2 text-[var(--clarity-completed)]">
          <DaypartIcon className="size-5" aria-hidden="true" />
          <p className="text-sm font-semibold">{daypart.greeting}</p>
        </div>
        <p
          className="mt-1.5 text-sm leading-6 text-muted-foreground"
          suppressHydrationWarning
        >
          {fullLocalDate} · {localTime}
        </p>
      </div>

      <div className="mt-7 space-y-2">
        <h1 className="clarity-heading-enter text-3xl font-semibold tracking-[-0.045em]">
          {primaryAction.heading}
        </h1>
        <p className="max-w-sm leading-7 text-muted-foreground">
          {primaryAction.supportingText}
        </p>
      </div>

      <div className="mt-7">
        {primaryAction.kind === "start" ? (
          <form action={startMyDayAction}>
            <PendingButton
              type="submit"
              size="lg"
              pendingLabel="Starting today…"
              className="h-12 w-full rounded-xl text-base"
            >
              {primaryAction.label}
              <ArrowRight />
            </PendingButton>
          </form>
        ) : (
          <Button
            asChild
            size="lg"
            className="h-12 w-full rounded-xl text-base"
          >
            <Link href={primaryAction.href}>
              {primaryAction.label}
              <ArrowRight />
            </Link>
          </Button>
        )}

        <Link
          href="/calendar"
          className="mt-4 flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CalendarDays
            className="size-5 shrink-0 text-[var(--clarity-completed)]"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              Plan ahead
            </span>
            <span className="block text-xs leading-5 text-muted-foreground">
              Calendar
            </span>
          </span>
        </Link>
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
