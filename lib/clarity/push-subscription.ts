export type NormalizedPushSubscription = {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  expirationTime: string | null;
};

export type PushAvailability =
  | "unsupported"
  | "installation_required"
  | "denied"
  | "ready"
  | "granted";

export const NOTIFICATION_NAVIGATION_MESSAGE_TYPE =
  "clarity:notification-navigation";

const notificationTargetDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const notificationTargetUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveNotificationNavigationTarget(
  value: unknown,
  origin: string,
) {
  if (!value || typeof value !== "object") return null;
  const message = value as { type?: unknown; targetUrl?: unknown };
  if (
    message.type !== NOTIFICATION_NAVIGATION_MESSAGE_TYPE ||
    typeof message.targetUrl !== "string"
  ) {
    return null;
  }

  let target: URL;
  try {
    target = new URL(message.targetUrl, origin);
  } catch {
    return null;
  }
  const date = target.searchParams.get("date");
  const commitment = target.searchParams.get("commitment");
  if (
    target.origin !== origin ||
    target.pathname !== "/calendar" ||
    !date ||
    !notificationTargetDatePattern.test(date) ||
    !commitment ||
    !notificationTargetUuidPattern.test(commitment)
  ) {
    return null;
  }
  return `${target.pathname}?date=${encodeURIComponent(date)}&commitment=${encodeURIComponent(commitment)}`;
}

export function getPushAvailability(input: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotifications: boolean;
  standalone: boolean;
  permission: NotificationPermission | "unavailable";
}): PushAvailability {
  if (!input.hasServiceWorker || !input.hasNotifications) return "unsupported";
  if (!input.hasPushManager) {
    return input.standalone ? "unsupported" : "installation_required";
  }
  if (input.permission === "denied") return "denied";
  if (input.permission === "granted") return "granted";
  return "ready";
}

export function normalizePushSubscription(
  subscription: PushSubscriptionJSON,
): NormalizedPushSubscription {
  const endpoint = subscription.endpoint?.trim();
  const p256dhKey = subscription.keys?.p256dh?.trim();
  const authKey = subscription.keys?.auth?.trim();
  if (!endpoint || !p256dhKey || !authKey) {
    throw new Error("The browser returned an incomplete push subscription.");
  }

  return {
    endpoint,
    p256dhKey,
    authKey,
    expirationTime:
      subscription.expirationTime === null ||
      subscription.expirationTime === undefined
        ? null
        : new Date(subscription.expirationTime).toISOString(),
  };
}

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
