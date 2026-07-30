"use client";

import { ArrowLeft, Lightbulb, Plus, X } from "lucide-react";
import { useState } from "react";

import { addActionAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  initialDailyLoopActionState,
  type DailyLoopActionState,
} from "@/lib/clarity/action-state";
import { ActionFields } from "./action-fields";
import { OngoingContextPrompt } from "./ongoing-context-prompt";
import { PendingButton } from "./pending-button";

export function AddActionForm({
  planId,
  proposed = false,
}: {
  planId: string;
  proposed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = proposed ? "Add to proposed plan" : "Add action";

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => setOpen(true)}
        className="h-12 w-full rounded-xl text-base"
      >
        <Plus />
        {label}
      </Button>
    );
  }

  return (
    <AddActionPanel
      planId={planId}
      label={label}
      onClose={() => setOpen(false)}
    />
  );
}

function AddActionPanel({
  planId,
  label,
  onClose,
}: {
  planId: string;
  label: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<DailyLoopActionState>(
    initialDailyLoopActionState,
  );
  const [responseVersion, setResponseVersion] = useState(0);
  const feedback = state.addActionFeedback;
  const timeWarning = state.addActionTimeWarning;
  const contextPrompt = state.addActionContextPrompt;
  const clarificationNeeded =
    feedback?.classification === "ambiguous" &&
    !feedback.exhausted;
  const clarificationExhausted =
    feedback?.classification === "ambiguous" &&
    feedback.exhausted;

  async function submitAction(formData: FormData) {
    const nextState = await addActionAction(state, formData);
    setState(nextState);
    setResponseVersion((version) => version + 1);
  }

  function resetAttempt() {
    setState(initialDailyLoopActionState);
  }

  function handleTitleChange(value: string) {
    const previousTitle =
      state.addActionFeedback?.originalInput ??
      state.addActionDraft?.title ??
      "";

    if (
      hasPreviousResult(state) &&
      normalizeInput(value) !== normalizeInput(previousTitle)
    ) {
      resetAttempt();
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--clarity-completed)] bg-secondary p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--clarity-completed)]">
            {label}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep it specific and doable.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close add action form"
          className="rounded-xl"
        >
          <X />
        </Button>
      </div>

      {contextPrompt ? (
        <div className="space-y-3">
          <p
            role="status"
            className="rounded-xl bg-card px-4 py-3 text-sm font-semibold text-[var(--clarity-completed)]"
          >
            Action added.
          </p>
          <OngoingContextPrompt
            actionId={contextPrompt.actionId}
            suggestion={contextPrompt.suggestion}
            destination={contextPrompt.destination}
          />
        </div>
      ) : (
        <form
          action={submitAction}
          className="space-y-5"
        >
          <input type="hidden" name="planId" value={planId} />
          <ActionFields
            key={responseVersion}
            state={state}
            simple
            initialValues={state.addActionDraft}
            onTitleChange={handleTitleChange}
          />

          {clarificationNeeded && (
            <label className="block space-y-2 rounded-xl bg-card p-4">
              <input
                type="hidden"
                name="clarificationQuestion"
                value={feedback.clarificationQuestion}
              />
              <span className="block text-sm font-semibold">
                {feedback.message}
              </span>
              <Input
                name="clarificationAnswer"
                maxLength={1000}
                required
                autoFocus
                placeholder="Add the missing detail…"
                className="h-12 rounded-xl"
              />
              {state.fieldErrors?.clarificationAnswer?.[0] && (
                <span className="block text-sm text-[var(--clarity-completed)]">
                  {state.fieldErrors.clarificationAnswer[0]}
                </span>
              )}
            </label>
          )}

          {clarificationExhausted && (
            <div className="space-y-4 rounded-xl bg-card p-4">
              <p role="alert" className="text-sm leading-6">
                I still don’t have enough detail to create this action.
              </p>
              <div className="grid gap-2">
                <Button
                  type="button"
                  onClick={resetAttempt}
                  className="h-11 rounded-xl"
                >
                  Edit action
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  className="h-11 rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {feedback?.classification === "user_unsure" && (
            <div
              role="status"
              className="rounded-xl bg-card p-4 text-sm leading-6"
            >
              {feedback.message}
            </div>
          )}

          {feedback?.classification === "invalid" && (
            <p
              role="alert"
              className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6"
            >
              {feedback.message}
            </p>
          )}

          {state.error && (
            <p
              role="alert"
              className="rounded-xl border border-border bg-card px-4 py-3 text-sm"
            >
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="text-sm text-[var(--clarity-completed)]">
              {state.success} Close this panel when you&apos;re done.
            </p>
          )}

          {timeWarning ? (
            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              <p role="status" className="text-sm leading-6">
                {timeWarning.message}
              </p>
              <div className="grid gap-2">
                <PendingButton
                  type="submit"
                  name="submissionIntent"
                  value="shorten_time"
                  pendingLabel="Shortening…"
                  className="h-11 rounded-xl"
                >
                  Shorten it
                </PendingButton>
                <PendingButton
                  type="submit"
                  name="submissionIntent"
                  value="move_tomorrow"
                  pendingLabel="Moving…"
                  variant="outline"
                  className="h-11 rounded-xl"
                >
                  Move to tomorrow
                </PendingButton>
                <PendingButton
                  type="submit"
                  name="submissionIntent"
                  value="add_anyway"
                  pendingLabel="Adding action…"
                  variant="ghost"
                  className="h-11 rounded-xl"
                >
                  Add anyway
                </PendingButton>
              </div>
            </div>
          ) : feedback?.classification === "user_unsure" ? (
            <div className="grid gap-3">
              <PendingButton
                type="submit"
                name="submissionIntent"
                value="help_choose"
                pendingLabel="Finding a direction…"
                className="h-12 rounded-xl"
              >
                <Lightbulb />
                Help me choose
              </PendingButton>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="h-12 rounded-xl"
              >
                <ArrowLeft />
                Go back
              </Button>
            </div>
          ) : clarificationExhausted ? null : (
            <PendingButton
              type="submit"
              size="lg"
              pendingLabel="Adding action…"
              className="h-12 w-full rounded-xl text-base"
            >
              <Plus />
              Add action
            </PendingButton>
          )}
        </form>
      )}
    </section>
  );
}

function hasPreviousResult(state: DailyLoopActionState) {
  return Boolean(
    state.error ||
      state.success ||
      state.addActionFeedback ||
      state.addActionTimeWarning,
  );
}

function normalizeInput(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
