"use client";

import {
  disablePushSubscriptionAction,
  registerPushSubscriptionAction,
} from "@/app/(app)/notifications/actions";
import {
  normalizePushSubscription,
  urlBase64ToUint8Array,
} from "./push-subscription";

export async function subscribeCurrentDevice() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Notifications are not configured yet.");

  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    registration = await navigator.serviceWorker.register("/sw.js");
  }
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  const normalized = normalizePushSubscription(subscription.toJSON());
  const result = await registerPushSubscriptionAction({
    ...normalized,
    userAgent: navigator.userAgent || null,
  });
  if (!result.success) {
    if (!existing) await subscription.unsubscribe();
    throw new Error(result.error);
  }
  return subscription;
}

export async function deactivateCurrentDevicePushSubscription() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const result = await disablePushSubscriptionAction(subscription.endpoint);
  if (!result.success) throw new Error(result.error);
  await subscription.unsubscribe();
}
