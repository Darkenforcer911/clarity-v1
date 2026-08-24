import assert from "node:assert/strict";
import test from "node:test";

import { dispatchNotificationBatch } from "./notification-dispatch-core.ts";

const delivery = {
  deliveryId: "10000000-0000-4000-8000-000000000001",
  attemptCount: 1,
  endpoint: "https://push.example/subscription",
  p256dhKey: "key",
  authKey: "auth",
  commitmentId: "20000000-0000-4000-8000-000000000002",
  commitmentType: "event",
  title: "Doctor appointment",
  occurrenceDate: "2026-08-17",
  reminderOffsetMinutes: 30,
  scheduledFor: "2026-08-17T00:00:00.000Z",
  usefulUntil: "2026-08-17T00:30:00.000Z",
};

function createStore(overrides = {}) {
  const calls = [];
  return {
    calls,
    store: {
      materialize: async () => 1,
      claim: async () => [delivery.deliveryId],
      revalidate: async () => delivery,
      recordSuccess: async (deliveryId) => {
        calls.push(["success", deliveryId]);
        return true;
      },
      recordFailure: async (input) => {
        calls.push(["failure", input]);
        return input.retryAt ? "retry" : "failed";
      },
      ...overrides,
    },
  };
}

test("successful provider acceptance records a sent delivery", async () => {
  const { store, calls } = createStore();
  let sentPayload;
  const summary = await dispatchNotificationBatch({
    store,
    provider: {
      send: async (_delivery, payload) => {
        sentPayload = payload;
      },
    },
    now: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.deepEqual(summary, {
    materialized: 1,
    claimed: 1,
    sent: 1,
    retried: 0,
    skipped: 0,
    failed: 0,
  });
  assert.equal(sentPayload.title, "Doctor appointment");
  assert.deepEqual(calls, [["success", delivery.deliveryId]]);
});

test("an At-start delivery reaches the provider and records success", async () => {
  const atStartDelivery = {
    ...delivery,
    reminderOffsetMinutes: 0,
    scheduledFor: "2026-08-17T00:00:00.000Z",
    usefulUntil: "2026-08-17T00:10:00.000Z",
  };
  const { store, calls } = createStore({
    revalidate: async () => atStartDelivery,
  });
  let sentPayload;
  const summary = await dispatchNotificationBatch({
    store,
    provider: {
      send: async (_delivery, payload) => {
        sentPayload = payload;
      },
    },
    now: new Date("2026-08-17T00:00:01.000Z"),
  });

  assert.equal(summary.sent, 1);
  assert.equal(sentPayload.body, "At start time");
  assert.deepEqual(calls, [["success", delivery.deliveryId]]);
});

test("stale revalidation skips without calling the provider", async () => {
  const { store } = createStore({ revalidate: async () => null });
  let providerCalled = false;
  const summary = await dispatchNotificationBatch({
    store,
    provider: { send: async () => { providerCalled = true; } },
    now: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(providerCalled, false);
  assert.equal(summary.skipped, 1);
});

test("expired subscriptions become terminal and are disabled", async () => {
  const { store, calls } = createStore();
  const summary = await dispatchNotificationBatch({
    store,
    provider: {
      send: async () => {
        throw Object.assign(new Error("gone"), { statusCode: 410 });
      },
    },
    now: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(summary.failed, 1);
  assert.equal(calls[0][1].disableSubscription, true);
  assert.equal(calls[0][1].retryAt, null);
});

test("transient provider errors schedule a bounded retry", async () => {
  const { store, calls } = createStore();
  const summary = await dispatchNotificationBatch({
    store,
    provider: {
      send: async () => {
        throw Object.assign(new Error("unavailable"), { statusCode: 503 });
      },
    },
    now: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(summary.retried, 1);
  assert.equal(calls[0][1].retryAt, "2026-08-17T00:02:00.000Z");
  assert.equal(calls[0][1].disableSubscription, false);
});

test("the third failed attempt is not retried", async () => {
  const { store } = createStore({
    revalidate: async () => ({ ...delivery, attemptCount: 3 }),
  });
  const summary = await dispatchNotificationBatch({
    store,
    provider: {
      send: async () => {
        throw Object.assign(new Error("unavailable"), { statusCode: 503 });
      },
    },
    now: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(summary.failed, 1);
  assert.equal(summary.retried, 0);
});
