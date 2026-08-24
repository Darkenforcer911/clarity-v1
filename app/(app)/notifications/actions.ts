"use server";

import { z } from "zod";

import {
  disablePushSubscription,
  isPushSubscriptionEnabled,
  registerPushSubscription,
} from "@/lib/clarity/notification-service";

const endpointSchema = z.string().trim().url().max(4096);
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  p256dhKey: z.string().trim().min(1).max(1024),
  authKey: z.string().trim().min(1).max(1024),
  expirationTime: z.string().datetime().nullable(),
  userAgent: z.string().max(500).nullable(),
});

export async function registerPushSubscriptionAction(input: unknown) {
  try {
    await registerPushSubscription(subscriptionSchema.parse(input));
    return { success: true as const, error: null };
  } catch (error) {
    console.error("Push subscription registration failed", error);
    return {
      success: false as const,
      error: actionError(error, "Couldn’t enable notifications. Try again."),
    };
  }
}

export async function disablePushSubscriptionAction(endpoint: unknown) {
  try {
    await disablePushSubscription(endpointSchema.parse(endpoint));
    return { success: true as const, error: null };
  } catch (error) {
    console.error("Push subscription deactivation failed", error);
    return {
      success: false as const,
      error: actionError(error, "Couldn’t disable notifications. Try again."),
    };
  }
}

export async function getPushSubscriptionStatusAction(endpoint: unknown) {
  try {
    return {
      success: true as const,
      enabled: await isPushSubscriptionEnabled(endpointSchema.parse(endpoint)),
      error: null,
    };
  } catch {
    return {
      success: false as const,
      enabled: false,
      error: "Couldn’t check notification status.",
    };
  }
}

function actionError(_error: unknown, fallback: string) {
  return fallback;
}
