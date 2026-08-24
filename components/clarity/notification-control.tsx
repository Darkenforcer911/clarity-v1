"use client";

import { Bell, BellOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { getPushSubscriptionStatusAction } from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import {
  deactivateCurrentDevicePushSubscription,
  subscribeCurrentDevice,
} from "@/lib/clarity/push-subscription-client";
import { getPushAvailability } from "@/lib/clarity/push-subscription";

type NotificationState =
  | "checking"
  | "unsupported"
  | "installation_required"
  | "ready"
  | "denied"
  | "enabled"
  | "working"
  | "error";

export function NotificationControl() {
  const [state, setState] = useState<NotificationState>("checking");
  const [message, setMessage] = useState<string | null>(null);

  const inspect = useCallback(async () => {
    const hasServiceWorker = "serviceWorker" in navigator;
    const hasPushManager = "PushManager" in window;
    const hasNotifications = "Notification" in window;
    const standaloneNavigator = navigator as Navigator & {
      standalone?: boolean;
    };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      standaloneNavigator.standalone === true;
    const availability = getPushAvailability({
      hasServiceWorker,
      hasPushManager,
      hasNotifications,
      standalone,
      permission: hasNotifications ? Notification.permission : "unavailable",
    });

    if (availability === "unsupported" || availability === "installation_required") {
      setState(availability);
      return;
    }
    if (availability === "denied") {
      setState("denied");
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
      setState("ready");
      return;
    }
    const result = await getPushSubscriptionStatusAction(subscription.endpoint);
    setState(result.success && result.enabled ? "enabled" : "ready");
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void inspect().catch(() => setState("error"));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [inspect]);

  const enable = async () => {
    setState("working");
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ready");
        return;
      }
      await subscribeCurrentDevice();
      setState("enabled");
      setMessage("Notifications enabled.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn’t enable notifications.");
    }
  };

  const disable = async () => {
    setState("working");
    setMessage(null);
    try {
      await deactivateCurrentDevicePushSubscription();
      setState("ready");
      setMessage("Notifications disabled.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn’t disable notifications.");
    }
  };

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {state === "enabled" ? <Bell className="size-4 text-primary" /> : <BellOff className="size-4 text-muted-foreground" />}
        Notifications
      </div>
      {state === "checking" && <p className="text-xs text-muted-foreground">Checking this device…</p>}
      {state === "unsupported" && (
        <p className="text-xs leading-5 text-muted-foreground">Push notifications are not supported in this browser.</p>
      )}
      {state === "installation_required" && (
        <p className="text-xs leading-5 text-muted-foreground">Install Clarity to your Home Screen, then open the installed app to enable notifications.</p>
      )}
      {state === "denied" && (
        <p className="text-xs leading-5 text-muted-foreground">Notifications are blocked. You can allow them in your device settings.</p>
      )}
      {(state === "ready" || state === "error") && (
        <Button type="button" variant="outline" onClick={() => void enable()} className="h-10 w-full rounded-xl">
          Enable notifications
        </Button>
      )}
      {state === "enabled" && (
        <Button type="button" variant="ghost" onClick={() => void disable()} className="h-10 w-full rounded-xl text-muted-foreground">
          Disable notifications
        </Button>
      )}
      {state === "working" && (
        <Button type="button" variant="outline" disabled className="h-10 w-full rounded-xl">
          Updating…
        </Button>
      )}
      {message && <p role="status" className="text-xs leading-5 text-muted-foreground">{message}</p>}
    </div>
  );
}
