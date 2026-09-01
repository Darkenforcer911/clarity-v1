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
import type { RecapCompletedItem } from "./recap-completed-item-form";
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
  const [completedItems, setCompletedItems] = useState<
    RecapCompletedItem[]
  >([]);
  const liveCurrentLocalDate = useCurrentLocalDate(
    timezone,
    currentLocalDate,
  );
  const recapDay = formatWeekday(transition.localDate);
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
        actualMinutes: current[actionId]?.actualMinutes ?? "",
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
            {(outcome === "finished" || outcome === "made_progress") &&
              validActualMinutes(draft.actualMinutes) !== null && (
                <input
                  type="hidden"
                  name={`actualMinutes:${action.id}`}
                  value={draft.actualMinutes}
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
      {completedItems.map((item) => (
        <span key={item.id}>
          <input type="hidden" name="unplannedItemId" value={item.id} />
          <input
            type="hidden"
            name={`unplannedTitle:${item.id}`}
            value={item.title}
          />
          {item.completionTime && (
            <input
              type="hidden"
              name={`unplannedCompletionTime:${item.id}`}
              value={item.completionTime}
            />
          )}
          {item.actualMinutes !== null && (
            <input
              type="hidden"
              name={`unplannedActualMinutes:${item.id}`}
              value={item.actualMinutes}
            />
          )}
        </span>
      ))}
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
          plannedMinutes: action.estimated_minutes,
        })),
        drafts,
        activities: completedItems,
        onDraftChange: updateDraft,
        onAddActivity: (activity) =>
          setCompletedItems((current) => [...current, activity]),
        onUpdateActivity: (activity) =>
          setCompletedItems((current) =>
            current.map((item) =>
              item.id === activity.id ? activity : item,
            ),
          ),
        onDeleteActivity: (activityId) =>
          setCompletedItems((current) =>
            current.filter((item) => item.id !== activityId),
          ),
        heading: `Quick recap of ${recapDay}`,
        supportingCopy: hasCompleteGap
          ? "Confirm what happened, then continue catching up. This should take under 30 seconds."
          : `Confirm what happened ${recapDay}. This should take under 30 seconds.`,
        dayContext,
        onDayContextChange: setDayContext,
        continueLabel: `Save ${recapDay} and continue`,
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
        actualMinutes: "",
      } satisfies RecapActionDraft,
    ]),
  );
}

function validActualMinutes(value: string) {
  if (!value) return null;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440
    ? minutes
    : null;
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
