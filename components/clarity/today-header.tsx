"use client";

import { useEffect, useState } from "react";

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

  const hour = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100/60">
          Today
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-white">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
      </div>
      <div
        className="text-right text-xs leading-5 text-blue-100/70"
        suppressHydrationWarning
      >
        <p>{date}</p>
        <p className="font-semibold text-white">{time}</p>
      </div>
    </header>
  );
}
