import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const actionFields = read("../../components/clarity/action-fields.tsx");
const addActionForm = read("../../components/clarity/add-action-form.tsx");
const proposedActionCard = read(
  "../../components/clarity/proposed-action-card.tsx",
);
const workspaceActions = read(
  "../../app/(app)/today/action-workspace-actions.ts",
);

test("Add and Edit use the same one-off Action field foundation", () => {
  assert.match(
    addActionForm,
    /<ActionFields[\s\S]*simple[\s\S]*showRecurrence=\{false\}/,
  );
  assert.match(
    proposedActionCard,
    /<ActionFields[\s\S]*simple[\s\S]*showRecurrence=\{false\}/,
  );
  assert.match(actionFields, /label="What needs to be done\?"/);
  assert.match(actionFields, /<OptionalActionTimeField/);
  assert.match(actionFields, /<DurationFields/);
  assert.match(actionFields, /<DetailsControl/);
});

test("editing Details preserves generated Action fields without extending recurrence", () => {
  assert.match(
    proposedActionCard,
    /context: userEnteredDetails \?\? ""/,
  );
  assert.match(
    actionFields,
    /hideGeneratedDetails && \([\s\S]*name="whyItExists"[\s\S]*name="definitionOfDone"[\s\S]*name="suggestedMethod"/,
  );
  assert.match(
    workspaceActions,
    /function editableActionFields[\s\S]*formData\.has\("context"\)[\s\S]*`Context: \$\{context\}`/,
  );
  assert.match(
    workspaceActions,
    /fields\.whyItExists\.startsWith\("Context: "\)[\s\S]*: fields\.whyItExists/,
  );
  assert.match(
    workspaceActions,
    /editActionSchema\.parse\(editableActionFields\(formData\)\)/,
  );
  assert.match(actionFields, /\{showRecurrence && \(/);
  assert.doesNotMatch(
    proposedActionCard,
    /initialValues=\{\{[\s\S]*recurrencePattern:/,
  );
});
