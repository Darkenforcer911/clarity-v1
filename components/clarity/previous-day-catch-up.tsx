"use client";

import { useActionState, useState } from "react";

import { confirmPreviousDayAction } from "@/app/(app)/today/day-transition-actions";
import type { PreviousDayTransition } from "@/lib/clarity/daily-loop-queries";
import { initialDayTransitionActionState } from "@/lib/clarity/day-transition-state";
import {
  addLocalDays,
  formatWeekday,
} from "@/lib/clarity/date-time";
import type { RecapActionDraft } from "./recap-action-panel";
import { RecapScreen } from "./recap-screen";
import { useCurrentLocalDate } from "./use-current-local-date";

type WrapTransition = Extract<
  PreviousDayTransition,
  { kind: "wrap_up" }
>;

export function PreviousDayCatchUp({
  transition,
  timezone,
  currentLocalDate,
}: {
  transition: WrapTransition;
  timezone: string;
  currentLocalDate: string;
}) {
  const [state, formAction] = useActionState(
    confirmPreviousDayAction,
    initialDayTransitionActionState,
  );
  const plannedActions = transition.actions;
  const [drafts, setDrafts] = useState<Record<string, RecapActionDraft>>(
    () => initialDrafts(plannedActions, timezone),
  );
  const [dayContext, setDayContext] = useState("");
  const liveCurrentLocalDate = useCurrentLocalDate(
    timezone,
    currentLocalDate,
  );
  const recapDay = formatWeekday(transition.localDate);
  const currentDay = formatWeekday(liveCurrentLocalDate);
  const hasCompleteGap =
    addLocalDays(transition.localDate, 1) <
    liveCurrentLocalDate;

  function updateDraft(
    actionId: string,
    update: Partial<RecapActionDraft>,
  ) {
    setDrafts((current) => ({
      ...current,
      [actionId]: {
        ...current[actionId],
        outcomeConfirmed:
          current[actionId]?.outcomeConfirmed ?? false,
        completionTime: current[actionId]?.completionTime ?? "",
        timeUnknown: current[actionId]?.timeUnknown ?? true,
        completionCorrected:
          current[actionId]?.completionCorrected ?? false,
        progressNote: current[actionId]?.progressNote ?? "",
        notDoneNote: current[actionId]?.notDoneNote ?? "",
        closeReason: current[actionId]?.closeReason ?? "",
        closeContext: current[actionId]?.closeContext ?? "",
        resolvedElsewhereNote:
          current[actionId]?.resolvedElsewhereNote ?? "",
        supportingPhrase:
          current[actionId]?.supportingPhrase ?? "",
        ...update,
      },
    }));
  }

  const hiddenFields = (
    <>
      {plannedActions.map((action) => {
        const draft = drafts[action.id];
        const outcome = submittedOutcome(draft);

        return (
          <span key={action.id}>
            <input type="hidden" name="actionId" value={action.id} />
            <input
              type="hidden"
              name={`outcome:${action.id}`}
              value={outcome ?? ""}
            />
            <input
              type="hidden"
              name={`completionCorrected:${action.id}`}
              value={String(draft?.completionCorrected ?? false)}
            />
            {outcome === "finished" &&
              draft.completionTime &&
              !draft.timeUnknown && (
                <input
                  type="hidden"
                  name={`completedTime:${action.id}`}
                  value={draft.completionTime}
                />
              )}
            {outcome === "made_progress" && (
              <input
                type="hidden"
                name={`progressNote:${action.id}`}
                value={draft.progressNote}
              />
            )}
            {outcome === "not_done" && draft.notDoneNote.trim() && (
              <input
                type="hidden"
                name={`notDoneNote:${action.id}`}
                value={draft.notDoneNote}
              />
            )}
            {outcome === "closed" && (
              <>
                <input
                  type="hidden"
                  name={`closeReason:${action.id}`}
                  value={draft.closeReason}
                />
                {draft.closeContext.trim() && (
                  <input
                    type="hidden"
                    name={`closeContext:${action.id}`}
                    value={draft.closeContext}
                  />
                )}
              </>
            )}
          </span>
        );
      })}
      <input
        type="hidden"
        name="contextSummary"
        value={dayContext}
      />
    </>
  );

  return (
    <RecapScreen
      formAction={formAction}
      hiddenFields={hiddenFields}
      experience={{
        recapDate: transition.localDate,
        currentDate: liveCurrentLocalDate,
        actions: plannedActions.map((action) => ({
          id: action.id,
          title: action.title,
          initiallyConfirmed: action.status === "completed",
        })),
        drafts,
        activities: [],
        onDraftChange: updateDraft,
        onDeleteActivity: () => undefined,
        heading: `Quick recap of ${recapDay}`,
        supportingCopy: hasCompleteGap
          ? "Just confirm the rough picture, then continue catching up. This should take under 30 seconds."
          : `Just confirm the rough picture, then move straight into ${currentDay}. This should take under 30 seconds.`,
        dayContext,
        onDayContextChange: setDayContext,
        continueLabel: hasCompleteGap
          ? `Save ${recapDay} and continue`
          : `Save ${recapDay} and shape ${currentDay}`,
        error: state.error,
      }}
    />
  );
}

function initialDrafts(
  actions: WrapTransition["actions"],
  timezone: string,
) {
  return Object.fromEntries(
    actions.map((action) => [
      action.id,
      {
        outcome:
          action.status === "completed" ? "finished" : undefined,
        outcomeConfirmed: action.status === "completed",
        completionTime: localTimeInput(action.completed_at, timezone),
        timeUnknown:
          action.completion_time_unknown || !action.completed_at,
        completionCorrected: false,
        progressNote: "",
        notDoneNote: "",
        closeReason: "",
        closeContext: "",
        resolvedElsewhereNote: "",
        supportingPhrase: "",
      } satisfies RecapActionDraft,
    ]),
  );
}

function submittedOutcome(draft: RecapActionDraft | undefined) {
  switch (draft?.outcome) {
    case "finished":
    case "made_progress":
    case "not_done":
    case "closed":
      return draft.outcome;
    default:
      return null;
  }
}

function localTimeInput(value: string | null, timezone: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
