"use client";

import { useEffect, useState } from "react";

import { getLocalDate } from "@/lib/clarity/date-time";

export function useCurrentLocalDate(
  timezone: string,
  initialLocalDate: string,
) {
  const [localDate, setLocalDate] = useState(initialLocalDate);

  useEffect(() => {
    const syncLocalDate = () =>
      setLocalDate(getLocalDate(timezone));
    const interval = window.setInterval(syncLocalDate, 30_000);

    syncLocalDate();
    window.addEventListener("focus", syncLocalDate);
    document.addEventListener("visibilitychange", syncLocalDate);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncLocalDate);
      document.removeEventListener("visibilitychange", syncLocalDate);
    };
  }, [timezone]);

  return localDate;
}
