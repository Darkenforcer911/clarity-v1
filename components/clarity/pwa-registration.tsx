"use client";

import { useEffect } from "react";

import { resolveNotificationNavigationTarget } from "@/lib/clarity/push-subscription";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleServiceWorkerMessage = (event: MessageEvent<unknown>) => {
      const targetUrl = resolveNotificationNavigationTarget(
        event.data,
        window.location.origin,
      );
      if (targetUrl) window.location.assign(targetUrl);
    };

    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage,
    );
    if (process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js");
    }

    return () => {
      navigator.serviceWorker.removeEventListener(
        "message",
        handleServiceWorkerMessage,
      );
    };
  }, []);

  return null;
}
