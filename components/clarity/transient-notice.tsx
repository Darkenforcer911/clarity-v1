"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const notices: Record<string, string> = {
  "action-added": "Action added.",
  "changes-saved": "Changes saved.",
  removed: "Removed from today.",
  "action-replaced": "Action replaced.",
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
  const message =
    notice === "recap-captured"
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
      role="status"
      className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.25rem)] z-50 w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 rounded-xl bg-secondary px-4 py-3 text-center text-sm font-semibold text-[var(--clarity-completed)] shadow-lg"
    >
      {message}
    </div>
  );
}
