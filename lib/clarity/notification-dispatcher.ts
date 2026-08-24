import "server-only";

import webPush from "web-push";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  dispatchNotificationBatch,
  type NotificationDeliveryStore,
  type NotificationProvider,
} from "./notification-dispatch-core";
import { reminderOffsetMinutesSchema } from "./notification-dispatch-domain";

const deliverySchema = z.object({
  deliveryId: z.string().uuid(),
  attemptCount: z.number().int().positive(),
  endpoint: z.string().url(),
  p256dhKey: z.string().min(1),
  authKey: z.string().min(1),
  commitmentId: z.string().uuid(),
  commitmentType: z.enum(["event", "deadline"]),
  title: z.string().min(1).max(200),
  occurrenceDate: z.iso.date(),
  reminderOffsetMinutes: reminderOffsetMinutesSchema,
  scheduledFor: z.iso.datetime({ offset: true }),
  usefulUntil: z.iso.datetime({ offset: true }),
});

type AdminClient = ReturnType<typeof createAdminClient>;

export async function dispatchDueNotifications() {
  const admin = createAdminClient();
  return dispatchNotificationBatch({
    store: createDeliveryStore(admin),
    provider: createWebPushProvider(),
  });
}

function createDeliveryStore(admin: AdminClient): NotificationDeliveryStore {
  return {
    async materialize(now) {
      const { data, error } = await admin.rpc(
        "materialize_notification_deliveries",
        { p_now: now },
      );
      if (error) throw new Error(error.message);
      return data;
    },
    async claim(now, batchSize, leaseSeconds) {
      const { data, error } = await admin.rpc("claim_notification_deliveries", {
        p_now: now,
        p_batch_size: batchSize,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw new Error(error.message);
      return z
        .array(z.object({ delivery_id: z.string().uuid() }))
        .parse(data)
        .map((row) => row.delivery_id);
    },
    async revalidate(deliveryId, now) {
      const { data, error } = await admin.rpc(
        "revalidate_notification_delivery",
        { p_delivery_id: deliveryId, p_now: now },
      );
      if (error) throw new Error(error.message);
      return data === null ? null : deliverySchema.parse(data);
    },
    async recordSuccess(deliveryId, now) {
      const { data, error } = await admin.rpc(
        "record_notification_delivery_success",
        {
          p_delivery_id: deliveryId,
          p_now: now,
        },
      );
      if (error) throw new Error(error.message);
      return data === true;
    },
    async recordFailure(input) {
      const { data, error } = await admin.rpc(
        "record_notification_delivery_failure",
        {
          p_delivery_id: input.deliveryId,
          p_error_code: input.errorCode,
          p_disable_subscription: input.disableSubscription,
          p_retry_at: input.retryAt ?? undefined,
          p_now: input.now,
        },
      );
      if (error) throw new Error(error.message);
      return data === "retry" || data === "failed" ? data : null;
    },
  };
}

function createWebPushProvider(): NotificationProvider {
  const publicKey = requiredEnvironment("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = requiredEnvironment("WEB_PUSH_VAPID_PRIVATE_KEY");
  const subject = requiredEnvironment("WEB_PUSH_VAPID_SUBJECT");
  webPush.setVapidDetails(subject, publicKey, privateKey);

  return {
    async send(delivery, payload, ttlSeconds) {
      await webPush.sendNotification(
        {
          endpoint: delivery.endpoint,
          keys: {
            p256dh: delivery.p256dhKey,
            auth: delivery.authKey,
          },
        },
        JSON.stringify(payload),
        {
          TTL: Math.min(ttlSeconds, 7200),
          urgency: "normal",
        },
      );
    },
  };
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Notification dispatcher is not configured: ${name}`);
  }
  return value;
}
