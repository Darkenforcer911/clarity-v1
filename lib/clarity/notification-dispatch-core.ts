import {
  buildNotificationPayload,
  classifyWebPushFailure,
  getRetryAt,
  type ClaimedNotificationDelivery,
  type NotificationPayload,
} from "./notification-dispatch-domain.ts";

export type NotificationDispatchSummary = {
  materialized: number;
  claimed: number;
  sent: number;
  retried: number;
  skipped: number;
  failed: number;
};

export type NotificationDeliveryStore = {
  materialize: (now: string) => Promise<number>;
  claim: (now: string, batchSize: number, leaseSeconds: number) => Promise<string[]>;
  revalidate: (
    deliveryId: string,
    now: string,
  ) => Promise<ClaimedNotificationDelivery | null>;
  recordSuccess: (deliveryId: string, now: string) => Promise<boolean>;
  recordFailure: (input: {
    deliveryId: string;
    errorCode: string;
    disableSubscription: boolean;
    retryAt: string | null;
    now: string;
  }) => Promise<"retry" | "failed" | null>;
};

export type NotificationProvider = {
  send: (
    delivery: ClaimedNotificationDelivery,
    payload: NotificationPayload,
    ttlSeconds: number,
  ) => Promise<void>;
};

export async function dispatchNotificationBatch(input: {
  store: NotificationDeliveryStore;
  provider: NotificationProvider;
  now?: Date;
  clock?: () => Date;
  batchSize?: number;
  leaseSeconds?: number;
}): Promise<NotificationDispatchSummary> {
  const clock = input.clock ?? (() => input.now ?? new Date());
  const now = clock();
  const nowIso = now.toISOString();
  const batchSize = input.batchSize ?? 25;
  const leaseSeconds = input.leaseSeconds ?? 300;
  const summary: NotificationDispatchSummary = {
    materialized: await input.store.materialize(nowIso),
    claimed: 0,
    sent: 0,
    retried: 0,
    skipped: 0,
    failed: 0,
  };
  const deliveryIds = await input.store.claim(nowIso, batchSize, leaseSeconds);
  summary.claimed = deliveryIds.length;

  for (const deliveryId of deliveryIds) {
    const validationNow = clock();
    const delivery = await input.store.revalidate(
      deliveryId,
      validationNow.toISOString(),
    );
    if (!delivery) {
      summary.skipped += 1;
      continue;
    }

    const payload = buildNotificationPayload(delivery);
    const ttlSeconds = Math.max(
      0,
      Math.floor(
        (new Date(delivery.usefulUntil).getTime() - validationNow.getTime()) /
          1000,
      ),
    );

    try {
      await input.provider.send(delivery, payload, ttlSeconds);
      if (
        await input.store.recordSuccess(deliveryId, clock().toISOString())
      ) {
        summary.sent += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      const failure = classifyWebPushFailure(error);
      const failureNow = clock();
      const retryAt = failure.retryable
        ? getRetryAt(delivery.attemptCount, failureNow, delivery.usefulUntil)
        : null;
      const status = await input.store.recordFailure({
        deliveryId,
        errorCode: failure.errorCode,
        disableSubscription: failure.disableSubscription,
        retryAt,
        now: failureNow.toISOString(),
      });
      if (status === "retry") summary.retried += 1;
      else if (status === "failed") summary.failed += 1;
      else summary.skipped += 1;
    }
  }

  return summary;
}
