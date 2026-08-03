"use client";

import { useEffect } from "react";

import { recordAppOpenedAction } from "@/app/(app)/today/actions";

export function AppActivityTracker() {
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void recordAppOpenedAction(timezone);
  }, []);

  return null;
}
