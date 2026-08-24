import assert from "node:assert/strict";
import test from "node:test";

import {
  getPushAvailability,
  normalizePushSubscription,
  NOTIFICATION_NAVIGATION_MESSAGE_TYPE,
  resolveNotificationNavigationTarget,
} from "./push-subscription.ts";

const supported = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotifications: true,
  standalone: true,
};

test("push availability covers unsupported, installation and denied states", () => {
  assert.equal(
    getPushAvailability({
      ...supported,
      hasServiceWorker: false,
      permission: "default",
    }),
    "unsupported",
  );
  assert.equal(
    getPushAvailability({
      ...supported,
      hasPushManager: false,
      standalone: false,
      permission: "default",
    }),
    "installation_required",
  );
  assert.equal(
    getPushAvailability({ ...supported, permission: "denied" }),
    "denied",
  );
  assert.equal(
    getPushAvailability({ ...supported, permission: "default" }),
    "ready",
  );
  assert.equal(
    getPushAvailability({ ...supported, permission: "granted" }),
    "granted",
  );
});

test("a browser push subscription is normalized for authenticated registration", () => {
  assert.deepEqual(
    normalizePushSubscription({
      endpoint: " https://push.example/subscription ",
      expirationTime: 1_800_000_000_000,
      keys: {
        p256dh: " p256dh-value ",
        auth: " auth-value ",
      },
    }),
    {
      endpoint: "https://push.example/subscription",
      p256dhKey: "p256dh-value",
      authKey: "auth-value",
      expirationTime: "2027-01-15T08:00:00.000Z",
    },
  );
});

test("incomplete browser subscriptions are rejected before registration", () => {
  assert.throws(
    () =>
      normalizePushSubscription({
        endpoint: "https://push.example/subscription",
        expirationTime: null,
        keys: { p256dh: "", auth: "auth-value" },
      }),
    /incomplete push subscription/,
  );
});

test("page-side notification navigation preserves the Calendar deep link", () => {
  assert.equal(
    resolveNotificationNavigationTarget(
      {
        type: NOTIFICATION_NAVIGATION_MESSAGE_TYPE,
        targetUrl:
          "https://clarity.example/calendar?date=2026-08-17&commitment=10000000-0000-4000-8000-000000000001",
      },
      "https://clarity.example",
    ),
    "/calendar?date=2026-08-17&commitment=10000000-0000-4000-8000-000000000001",
  );
});

test("page-side notification navigation rejects unsafe targets", () => {
  assert.equal(
    resolveNotificationNavigationTarget(
      {
        type: NOTIFICATION_NAVIGATION_MESSAGE_TYPE,
        targetUrl:
          "https://evil.example/calendar?date=2026-08-17&commitment=10000000-0000-4000-8000-000000000001",
      },
      "https://clarity.example",
    ),
    null,
  );
  assert.equal(
    resolveNotificationNavigationTarget(
      { type: "untrusted", targetUrl: "/calendar?date=2026-08-17" },
      "https://clarity.example",
    ),
    null,
  );
});
