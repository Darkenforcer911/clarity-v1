import assert from "node:assert/strict";
import test from "node:test";

import {
  getLaterCommitmentsHeading,
  MINIMUM_COMMITMENT_ATTENTION_WINDOW_MINUTES,
  partitionTodayCommitmentsForAttention,
} from "./today-commitment-priority.ts";
import { localDateTimeToIso } from "./date-time.ts";

const timezone = "Australia/Melbourne";
const localDate = "2026-08-29";

function at(localTime) {
  return new Date(localDateTimeToIso(localDate, localTime, timezone));
}

function commitment(id, time, overrides = {}) {
  return {
    id,
    user_id: "11111111-1111-4111-8111-111111111111",
    commitment_type: "event",
    title: id,
    local_date: localDate,
    event_start_time: time,
    deadline_due_time: null,
    duration_minutes: 30,
    recurrence: "none",
    recurrence_unit: null,
    recurrence_interval: 1,
    recurrence_weekdays: [],
    details: null,
    status: "scheduled",
    timezone,
    reminder_offsets_minutes: [],
    rescheduled_from_id: null,
    created_at: "2026-08-29T00:00:00.000Z",
    updated_at: "2026-08-29T00:00:00.000Z",
    occurrence_date: localDate,
    reconciliation_outcome: null,
    outcome_note: null,
    replacement_commitment_id: null,
    occurrence_id: null,
    outcome_recorded_at: null,
    completed_at: null,
    can_undo_completion: false,
    ...overrides,
  };
}

test("a distant evening commitment stays below the current Next Action", () => {
  const evening = commitment("Accutane", "21:30");
  const result = partitionTodayCommitmentsForAttention({
    commitments: [evening],
    localDate,
    timezone,
    now: at("05:31"),
    nextActionDurationMinutes: 45,
  });

  assert.deepEqual(result.approaching, []);
  assert.deepEqual(result.later.map((item) => item.id), ["Accutane"]);
  assert.equal(
    getLaterCommitmentsHeading({
      commitments: result.later,
      localDate,
      timezone,
      now: at("05:31"),
    }),
    "Later today",
  );
});

test("a commitment becomes prominent when it constrains the full next action", () => {
  const constraint = commitment("Interview", "06:16");
  const result = partitionTodayCommitmentsForAttention({
    commitments: [constraint],
    localDate,
    timezone,
    now: at("05:31"),
    nextActionDurationMinutes: 45,
  });

  assert.equal(result.attentionWindowMinutes, 45);
  assert.deepEqual(result.approaching.map((item) => item.id), ["Interview"]);
  assert.deepEqual(result.later, []);
});

test("the deterministic attention window is never shorter than 30 minutes", () => {
  const closeCommitment = commitment("Appointment", "05:51");
  const result = partitionTodayCommitmentsForAttention({
    commitments: [closeCommitment],
    localDate,
    timezone,
    now: at("05:31"),
    nextActionDurationMinutes: 10,
  });

  assert.equal(
    result.attentionWindowMinutes,
    MINIMUM_COMMITMENT_ATTENTION_WINDOW_MINUTES,
  );
  assert.deepEqual(result.approaching.map((item) => item.id), [
    "Appointment",
  ]);
});

test("resolved commitments remain visible without taking immediate priority", () => {
  const completed = commitment("Medication", "05:25", {
    reconciliation_outcome: "attended",
    completed_at: "2026-08-28T19:27:00.000Z",
  });
  const result = partitionTodayCommitmentsForAttention({
    commitments: [completed],
    localDate,
    timezone,
    now: at("05:31"),
    nextActionDurationMinutes: 45,
  });

  assert.deepEqual(result.approaching, []);
  assert.deepEqual(result.later.map((item) => item.id), ["Medication"]);
  assert.equal(
    getLaterCommitmentsHeading({
      commitments: result.later,
      localDate,
      timezone,
      now: at("05:31"),
    }),
    "Today's commitments",
  );
});
