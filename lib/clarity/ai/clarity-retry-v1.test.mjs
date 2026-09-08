import assert from "node:assert/strict";
import test from "node:test";

import { runClarityTurnSingleFlight } from "./clarity-turn-single-flight.ts";

test("concurrent attempts for one persisted message share one provider operation", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const operation = async () => {
    calls += 1;
    await gate;
    return "researched";
  };

  const first = runClarityTurnSingleFlight("message-1", operation);
  const second = runClarityTurnSingleFlight("message-1", operation);
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), ["researched", "researched"]);
  assert.equal(calls, 1);
});

test("a failed attempt releases single-flight state for one later explicit retry", async () => {
  let calls = 0;
  const operation = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary research failure");
    return "researched";
  };

  await assert.rejects(
    runClarityTurnSingleFlight("message-2", operation),
    /temporary research failure/,
  );
  assert.equal(
    await runClarityTurnSingleFlight("message-2", operation),
    "researched",
  );
  assert.equal(calls, 2);
});

test("different persisted messages are not incorrectly coalesced", async () => {
  let calls = 0;
  const operation = async () => {
    calls += 1;
    return calls;
  };
  const results = await Promise.all([
    runClarityTurnSingleFlight("message-a", operation),
    runClarityTurnSingleFlight("message-b", operation),
  ]);
  assert.deepEqual(results, [1, 2]);
});
