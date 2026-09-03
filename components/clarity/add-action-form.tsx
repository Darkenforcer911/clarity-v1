"use client";

import { ArrowLeft, Lightbulb, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { addActionAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  initialDailyLoopActionState,
  type DailyLoopActionState,
} from "@/lib/clarity/action-state";
import { ActionFields } from "./action-fields";
import { ClarityFormHeader } from "./clarity-form-header";
import { OngoingContextPrompt } from "./ongoing-context-prompt";
import { PendingButton } from "./pending-button";

export function AddActionForm({
  planId,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  onActionSaved,
}: {
  planId: string;
  proposed?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onActionSaved?: () => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const label = "Add action";
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      setLocalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );
  const closePanel = useCallback(() => setOpen(false), [setOpen]);

  if (!open) {
    if (hideTrigger) {
      return null;
    }

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
      onClose={closePanel}
      onActionSaved={onActionSaved}
    />
  );
}

function AddActionPanel({
  planId,
  label,
  onClose,
  onActionSaved,
}: {
  planId: string;
  label: string;
  onClose: () => void;
  onActionSaved?: () => void;
}) {
  const [state, setState] = useState<DailyLoopActionState>(
    initialDailyLoopActionState,
  );
  const [responseVersion, setResponseVersion] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const feedback = state.addActionFeedback;
  const timeWarning = state.addActionTimeWarning;
  const contextPrompt = state.addActionContextPrompt;
  const clarificationNeeded =
    feedback?.classification === "ambiguous" &&
    !feedback.exhausted;
  const clarificationExhausted =
    feedback?.classification === "ambiguous" &&
    feedback.exhausted;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;

      if (!panel) {
        return;
      }

      const bounds = panel.getBoundingClientRect();
      const navigation = document.querySelector<HTMLElement>(
        'nav[aria-label="Primary"]',
      );
      const appHeader = document.querySelector<HTMLElement>(
        "[data-app-shell-header]",
      );
      const safeAreaTop =
        Number.parseFloat(
          appHeader ? window.getComputedStyle(appHeader).paddingTop : "0",
        ) || 0;
      const visibleTop = safeAreaTop + 12;
      const visibleBottom =
        (navigation?.getBoundingClientRect().top ?? window.innerHeight) - 12;
      let adjustment = 0;

      if (bounds.top < visibleTop) {
        adjustment = bounds.top - visibleTop;
      } else if (bounds.top > visibleBottom - 44) {
        adjustment = bounds.top - (visibleBottom - 44);
      }

      if (Math.abs(adjustment) > 1) {
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

        window.scrollBy({
          top: adjustment,
          behavior: reduceMotion ? "auto" : "smooth",
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  async function submitAction(formData: FormData) {
    const nextState = await addActionAction(state, formData);
    setState(nextState);
    setResponseVersion((version) => version + 1);

    if (nextState.addActionContextPrompt) {
      onActionSaved?.();
    }
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
    <section
      ref={panelRef}
      className="w-full min-w-0 max-w-full space-y-5 rounded-2xl border border-border bg-card p-5 text-foreground"
    >
      <ClarityFormHeader
        title={label}
        subtitle="Keep it specific and doable."
        closeLabel="Close add action form"
        onClose={onClose}
      />

      {contextPrompt ? (
        <OngoingContextPrompt
          actionId={contextPrompt.actionId}
          suggestion={contextPrompt.suggestion}
          destination={contextPrompt.destination}
        />
      ) : (
        <form
          action={submitAction}
          className="w-full min-w-0 max-w-full space-y-5"
        >
          <input type="hidden" name="planId" value={planId} />
          <ActionFields
            key={responseVersion}
            state={state}
            simple
            showRecurrence={false}
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
                <span className="block text-sm text-destructive">
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
              className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-destructive"
            >
              {feedback.message}
            </p>
          )}

          {state.error && (
            <p
              role="alert"
              className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-destructive"
            >
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="text-sm text-ring">
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
