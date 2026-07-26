"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { recordAppOpenedAction } from "@/app/(app)/today/actions";

export function AppActivityTracker() {
  const router = useRouter();

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void recordAppOpenedAction(timezone).then(() => router.refresh());
  }, [router]);

  return null;
}
