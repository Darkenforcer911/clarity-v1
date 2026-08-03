import assert from "node:assert/strict";
import test from "node:test";

import { shapeTodaySchema } from "./shape-today-schema.ts";

test("proposal generation accepts no daily context", () => {
  const result = shapeTodaySchema.safeParse({});

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.contextForToday, "");
  }
});

test("supplied daily context remains optional and is trimmed", () => {
  const result = shapeTodaySchema.safeParse({
    contextForToday: "  Appointment at noon  ",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.contextForToday, "Appointment at noon");
  }
});

test("oversized optional context is rejected", () => {
  const result = shapeTodaySchema.safeParse({
    contextForToday: "x".repeat(2001),
  });

  assert.equal(result.success, false);
});
