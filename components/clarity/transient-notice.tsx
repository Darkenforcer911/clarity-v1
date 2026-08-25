"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { formatAddedActionNotice } from "@/lib/clarity/add-action-destination";

const notices: Record<string, string> = {
  "changes-saved": "Changes saved.",
  removed: "Removed from today.",
  "action-replaced": "Action replaced.",
  "caught-up": "Caught up",
};
const weekdays = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

export function TransientNotice() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const recapDay = searchParams.get("day");
  const addedActionTime = searchParams.get("time");
  const message =
    notice === "action-added"
      ? formatAddedActionNotice(addedActionTime)
      : notice === "recap-captured"
      ? recapDay && weekdays.has(recapDay)
        ? `${recapDay} captured`
        : "Previous day captured"
      : notice
        ? notices[notice]
        : null;

  useEffect(() => {
    if (!message) return;
    const clean = window.setTimeout(
      () => router.replace(pathname, { scroll: false }),
      3000,
    );
    return () => window.clearTimeout(clean);
  }, [message, pathname, router]);

  if (!message) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+4.25rem)]"
    >
      <div
        role="status"
        aria-live="polite"
        className="w-fit max-w-full rounded-xl bg-secondary px-4 py-3 text-center text-sm font-semibold text-[var(--clarity-completed)] shadow-lg"
      >
        {message}
      </div>
    </div>
  );
}
