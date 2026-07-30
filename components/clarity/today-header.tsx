"use client";

import { useEffect, useState } from "react";
import { getDayPeriod } from "@/lib/clarity/date-time";

export function TodayHeader({
  timezone,
  name,
}: {
  timezone: string;
  name: string | null;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const period = getDayPeriod(timezone, now);
  const greeting =
    period === "late_night"
      ? "Late night"
      : period === "morning"
        ? "Good morning"
        : period === "afternoon"
          ? "Good afternoon"
          : "Good evening";
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Today
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-foreground">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
      </div>
      <div
        className="text-right text-xs leading-5 text-muted-foreground"
        suppressHydrationWarning
      >
        <p>{date}</p>
        <p className="font-semibold text-foreground">{time}</p>
      </div>
    </header>
  );
}
