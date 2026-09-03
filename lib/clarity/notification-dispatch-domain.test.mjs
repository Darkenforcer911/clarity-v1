import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNotificationPayload,
  calculateNotificationSchedule,
  classifyWebPushFailure,
  formatNotificationBody,
  getRetryAt,
  isDispatchAuthorizationValid,
  isNotificationOccurrenceEligible,
  reminderOffsetMinutesSchema,
} from "./notification-dispatch-domain.ts";

test("claimed delivery validation accepts zero and rejects negative offsets", () => {
  assert.equal(reminderOffsetMinutesSchema.safeParse(0).success, true);
  assert.equal(reminderOffsetMinutesSchema.safeParse(30).success, true);
  assert.equal(reminderOffsetMinutesSchema.safeParse(-1).success, false);
});

test("timed event and deadline reminders resolve from the commitment timezone", () => {
  assert.deepEqual(
    calculateNotificationSchedule({
      commitmentType: "event",
      occurrenceDate: "2026-08-17",
      wallClockTime: "10:00",
      timezone: "Australia/Melbourne",
      reminderOffsetMinutes: 30,
    }),
    {
      scheduledFor: "2026-08-16T23:30:00.000Z",
      usefulUntil: "2026-08-17T00:00:00.000Z",
    },
  );
  assert.equal(
    calculateNotificationSchedule({
      commitmentType: "event",
      occurrenceDate: "2026-08-17",
      wallClockTime: "10:00",
      timezone: "Australia/Melbourne",
      reminderOffsetMinutes: 120,
    }).scheduledFor,
    "2026-08-16T22:00:00.000Z",
  );
  assert.equal(
    calculateNotificationSchedule({
      commitmentType: "deadline",
      occurrenceDate: "2026-08-17",
      wallClockTime: "17:00",
      timezone: "Australia/Melbourne",
      reminderOffsetMinutes: 1440,
    }).scheduledFor,
    "2026-08-16T07:00:00.000Z",
  );
});

test("At-start reminders use the exact timed occurrence with a dispatch window", () => {
  assert.deepEqual(
    calculateNotificationSchedule({
      commitmentType: "event",
      occurrenceDate: "2026-08-17",
      wallClockTime: "10:00",
      timezone: "Australia/Melbourne",
      reminderOffsetMinutes: 0,
    }),
    {
      scheduledFor: "2026-08-17T00:00:00.000Z",
      usefulUntil: "2026-08-17T00:10:00.000Z",
    },
  );
  assert.deepEqual(
    calculateNotificationSchedule({
      commitmentType: "deadline",
      occurrenceDate: "2026-08-17",
      wallClockTime: "17:00",
      timezone: "Australia/Melbourne",
      reminderOffsetMinutes: 0,
    }),
    {
      scheduledFor: "2026-08-17T07:00:00.000Z",
      usefulUntil: "2026-08-17T07:10:00.000Z",
    },
  );
});

test("date-only deadlines use 9 am on the reminder day without inventing a due time", () => {
  assert.deepEqual(
    calculateNotificationSchedule({
      commitmentType: "deadline",
      occurrenceDate: "2026-08-16",
      wallClockTime: null,
      timezone: "Australia/Melbourne",
      reminderOffsetMinutes: 1440,
    }),
    {
      scheduledFor: "2026-08-14T23:00:00.000Z",
      usefulUntil: "2026-08-15T01:00:00.000Z",
    },
  );
  assert.throws(() =>
    calculateNotificationSchedule({
      commitmentType: "deadline",
      occurrenceDate: "2026-08-16",
      wallClockTime: null,
      timezone: "Australia/Melbourne",
      reminderOffsetMinutes: 120,
    }),
  );
  assert.throws(() =>
    calculateNotificationSchedule({
      commitmentType: "deadline",
      occurrenceDate: "2026-08-16",
      wallClockTime: null,
      timezone: "Australia/Melbourne",
      reminderOffsetMinutes: 0,
    }),
  );
});

test("stored timezone and DST determine the absolute reminder instant", () => {
  const melbourne = calculateNotificationSchedule({
    commitmentType: "event",
    occurrenceDate: "2026-10-05",
    wallClockTime: "09:00",
    timezone: "Australia/Melbourne",
    reminderOffsetMinutes: 1440,
  });
  const london = calculateNotificationSchedule({
    commitmentType: "event",
    occurrenceDate: "2026-10-05",
    wallClockTime: "09:00",
    timezone: "Europe/London",
    reminderOffsetMinutes: 1440,
  });
  assert.equal(melbourne.scheduledFor, "2026-10-03T22:00:00.000Z");
  assert.equal(london.scheduledFor, "2026-10-04T08:00:00.000Z");
  assert.notEqual(melbourne.scheduledFor, london.scheduledFor);
});

test("existing recurrence rules and occurrence outcomes determine eligibility", () => {
  const cases = [
    ["daily", "2026-08-06", true],
    ["weekly", "2026-08-12", true],
    ["fortnightly", "2026-08-19", true],
    ["monthly", "2026-09-05", true],
    ["weekly", "2026-08-13", false],
  ];
  for (const [recurrence, occurrenceDate, expected] of cases) {
    assert.equal(
      isNotificationOccurrenceEligible({
        startDate: "2026-08-05",
        recurrence,
        occurrenceDate,
        hasOccurrenceOutcome: false,
      }),
      expected,
    );
  }
  assert.equal(
    isNotificationOccurrenceEligible({
      startDate: "2026-08-05",
      recurrence: "daily",
      occurrenceDate: "2026-08-06",
      hasOccurrenceOutcome: true,
    }),
    false,
  );
});

test("payload copy and target are deterministic", () => {
  const payload = buildNotificationPayload({
    deliveryId: "10000000-0000-4000-8000-000000000001",
    attemptCount: 1,
    endpoint: "https://push.example/subscription",
    p256dhKey: "key",
    authKey: "auth",
    commitmentId: "20000000-0000-4000-8000-000000000002",
    commitmentType: "event",
    title: "Doctor appointment",
    occurrenceDate: "2026-08-17",
    reminderOffsetMinutes: 120,
    scheduledFor: "2026-08-17T00:00:00.000Z",
    usefulUntil: "2026-08-17T02:00:00.000Z",
  });
  assert.deepEqual(payload, {
    title: "Doctor appointment",
    body: "In 2 hours",
    tag: "calendar:20000000-0000-4000-8000-000000000002:2026-08-17:120",
    targetUrl:
      "/calendar?date=2026-08-17&commitment=20000000-0000-4000-8000-000000000002",
  });
  assert.equal(formatNotificationBody("deadline", 1440), "Due tomorrow");
  assert.equal(formatNotificationBody("event", 30), "In 30 minutes");
  assert.equal(formatNotificationBody("event", 0), "At start time");
  assert.equal(formatNotificationBody("deadline", 0), "At start time");
});

test("Action reminders keep one canonical Action target and honest anchor copy", () => {
  const base = {
    deliveryId: "10000000-0000-4000-8000-000000000001",
    attemptCount: 1,
    endpoint: "https://push.example/subscription",
    p256dhKey: "key",
    authKey: "auth",
    targetType: "action",
    commitmentId: null,
    commitmentType: null,
    actionId: "30000000-0000-4000-8000-000000000003",
    title: "Finish assignment",
    occurrenceDate: "2026-09-04",
    scheduledFor: "2026-09-04T08:00:00.000Z",
    usefulUntil: "2026-09-04T10:00:00.000Z",
  };

  assert.deepEqual(
    buildNotificationPayload({
      ...base,
      actionReminderAnchor: "when",
      reminderOffsetMinutes: 30,
    }),
    {
      title: "Finish assignment",
      body: "Starts in 30 minutes",
      tag: "action:30000000-0000-4000-8000-000000000003:2026-09-04:30",
      targetUrl:
        "/today/actions/30000000-0000-4000-8000-000000000003?from=calendar&date=2026-09-04",
    },
  );
  assert.equal(
    buildNotificationPayload({
      ...base,
      actionReminderAnchor: "due",
      reminderOffsetMinutes: 60,
    }).body,
    "Due in 1 hour",
  );
  assert.equal(
    buildNotificationPayload({
      ...base,
      actionReminderAnchor: "due",
      reminderOffsetMinutes: 0,
    }).body,
    "Due now",
  );
});

test("provider failures and bounded retries are classified conservatively", () => {
  assert.deepEqual(classifyWebPushFailure({ statusCode: 410 }), {
    errorCode: "provider_410",
    disableSubscription: true,
    retryable: false,
  });
  assert.equal(classifyWebPushFailure({ statusCode: 503 }).retryable, true);
  assert.equal(classifyWebPushFailure({ statusCode: 400 }).retryable, false);
  assert.equal(
    getRetryAt(
      1,
      new Date("2026-08-17T00:00:00.000Z"),
      "2026-08-17T01:00:00.000Z",
    ),
    "2026-08-17T00:02:00.000Z",
  );
  assert.equal(
    getRetryAt(
      3,
      new Date("2026-08-17T00:00:00.000Z"),
      "2026-08-17T01:00:00.000Z",
    ),
    null,
  );
});

test("dispatcher authorization rejects missing/wrong secrets and accepts the exact bearer", () => {
  assert.equal(isDispatchAuthorizationValid(null, "correct-secret"), false);
  assert.equal(
    isDispatchAuthorizationValid("Bearer wrong-secret", "correct-secret"),
    false,
  );
  assert.equal(
    isDispatchAuthorizationValid("Bearer correct-secret", "correct-secret"),
    true,
  );
});
