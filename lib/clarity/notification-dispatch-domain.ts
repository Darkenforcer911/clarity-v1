import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  occursOnCalendarDate,
} from "./calendar-rules.ts";
import type {
  CalendarRecurrenceRule,
  LegacyCalendarRecurrencePreset,
} from "./calendar-recurrence.ts";
export {
  calculateNotificationSchedule,
  NOTIFICATION_LATENESS_MINUTES,
} from "./calendar-reminder-schedule.ts";

export const NOTIFICATION_MAX_ATTEMPTS = 3;
export const reminderOffsetMinutesSchema = z.number().int().nonnegative();

export type NotificationCommitmentType = "event" | "deadline";

type ClaimedNotificationDeliveryBase = {
  deliveryId: string;
  attemptCount: number;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  title: string;
  occurrenceDate: string;
  reminderOffsetMinutes: number;
  scheduledFor: string;
  usefulUntil: string;
};

export type ClaimedNotificationDelivery =
  | (ClaimedNotificationDeliveryBase & {
      targetType: "calendar";
      commitmentId: string;
      commitmentType: NotificationCommitmentType;
      actionId: null;
    })
  | (ClaimedNotificationDeliveryBase & {
      targetType: "action";
      commitmentId: null;
      commitmentType: null;
      actionId: string;
      actionReminderAnchor: "when" | "due";
    });

export type NotificationPayload = {
  title: string;
  body: string;
  tag: string;
  targetUrl: string;
};

export type ProviderFailure = {
  errorCode: string;
  disableSubscription: boolean;
  retryable: boolean;
};

export function isNotificationOccurrenceEligible(input: {
  startDate: string;
  recurrence: CalendarRecurrenceRule | LegacyCalendarRecurrencePreset;
  occurrenceDate: string;
  hasOccurrenceOutcome: boolean;
}) {
  return (
    !input.hasOccurrenceOutcome &&
    occursOnCalendarDate(
      input.startDate,
      input.recurrence,
      input.occurrenceDate,
    )
  );
}

export function buildNotificationPayload(
  delivery: ClaimedNotificationDelivery,
): NotificationPayload {
  if (delivery.targetType === "action") {
    return {
      title: delivery.title,
      body:
        delivery.reminderOffsetMinutes === 0
          ? delivery.actionReminderAnchor === "due"
            ? "Due now"
            : "It's time"
          : formatActionNotificationBody(
              delivery.reminderOffsetMinutes,
              delivery.actionReminderAnchor,
            ),
      tag: [
        "action",
        delivery.actionId,
        delivery.occurrenceDate,
        delivery.reminderOffsetMinutes,
      ].join(":"),
      targetUrl: `/today/actions/${encodeURIComponent(delivery.actionId)}?from=calendar&date=${encodeURIComponent(delivery.occurrenceDate)}`,
    };
  }

  return {
    title: delivery.title,
    body: formatNotificationBody(
      delivery.commitmentType,
      delivery.reminderOffsetMinutes,
    ),
    tag: [
      "calendar",
      delivery.commitmentId,
      delivery.occurrenceDate,
      delivery.reminderOffsetMinutes,
    ].join(":"),
    targetUrl: `/calendar?date=${encodeURIComponent(delivery.occurrenceDate)}&commitment=${encodeURIComponent(delivery.commitmentId)}`,
  };
}

function formatActionNotificationBody(
  offsetMinutes: number,
  anchor: "when" | "due",
) {
  const verb = anchor === "due" ? "Due" : "Starts";
  if (offsetMinutes === 1440) return `${verb} tomorrow`;
  if (offsetMinutes % 1440 === 0) {
    const days = offsetMinutes / 1440;
    return `${verb} in ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (offsetMinutes % 60 === 0) {
    const hours = offsetMinutes / 60;
    return `${verb} in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${verb} in ${offsetMinutes} minutes`;
}

export function formatNotificationBody(
  commitmentType: NotificationCommitmentType,
  offsetMinutes: number,
) {
  if (offsetMinutes === 0) return "At start time";
  const prefix = commitmentType === "deadline" ? "Due " : "";
  if (offsetMinutes === 1440) return `${prefix}tomorrow`.replace(/^t/, "T");
  if (offsetMinutes % 1440 === 0) {
    const days = offsetMinutes / 1440;
    return `${prefix}in ${days} ${days === 1 ? "day" : "days"}`.replace(
      /^(.)/,
      (value) => value.toUpperCase(),
    );
  }
  if (offsetMinutes % 60 === 0) {
    const hours = offsetMinutes / 60;
    return `${prefix}in ${hours} ${hours === 1 ? "hour" : "hours"}`.replace(
      /^(.)/,
      (value) => value.toUpperCase(),
    );
  }
  return `${prefix}in ${offsetMinutes} minutes`.replace(/^(.)/, (value) =>
    value.toUpperCase(),
  );
}

export function classifyWebPushFailure(error: unknown): ProviderFailure {
  const statusCode = readStatusCode(error);
  if (statusCode === 404 || statusCode === 410) {
    return {
      errorCode: `provider_${statusCode}`,
      disableSubscription: true,
      retryable: false,
    };
  }
  if (
    statusCode === null ||
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500
  ) {
    return {
      errorCode: statusCode === null ? "network_error" : `provider_${statusCode}`,
      disableSubscription: false,
      retryable: true,
    };
  }
  return {
    errorCode: `provider_${statusCode}`,
    disableSubscription: false,
    retryable: false,
  };
}

export function getRetryAt(
  attemptCount: number,
  now: Date,
  usefulUntil: string,
) {
  const delayMinutes = attemptCount === 1 ? 2 : attemptCount === 2 ? 5 : null;
  if (delayMinutes === null || attemptCount >= NOTIFICATION_MAX_ATTEMPTS) {
    return null;
  }
  const retryAt = new Date(now.getTime() + delayMinutes * 60_000);
  return retryAt.getTime() < new Date(usefulUntil).getTime()
    ? retryAt.toISOString()
    : null;
}

export function isDispatchAuthorizationValid(
  authorizationHeader: string | null,
  secret: string,
) {
  const prefix = "Bearer ";
  if (!authorizationHeader?.startsWith(prefix) || !secret) return false;
  const supplied = Buffer.from(authorizationHeader.slice(prefix.length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function readStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return null;
  }
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
