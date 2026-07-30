"use client";

import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addLocalDays,
  formatFullLocalDate,
  formatWeekday,
} from "@/lib/clarity/date-time";
import { progressExplanationError } from "@/lib/clarity/recap-validation";
import {
  HistoricalActivityForm,
  type HistoricalActivity,
} from "./historical-activity-form";
import { PendingButton } from "./pending-button";
import {
  RecapActionPanel,
  type RecapActionDraft,
} from "./recap-action-panel";
import { RecapDayContextField } from "./recap-day-context-field";

export type RecapPlanAction = {
  id: string;
  title: string;
  initiallyConfirmed: boolean;
};

export function RecapExperience({
  recapDate,
  currentDate,
  actions,
  drafts,
  activities,
  onDraftChange,
  onDeleteActivity,
  onAddActivity,
  onUpdateActivity,
  onAddMissing,
  continueType = "submit",
  onContinue,
  error,
  heading,
  supportingCopy,
  afterActionSections,
  dayContext,
  onDayContextChange,
  continueLabel,
  continueDisabled = false,
  reviewSectionHeading,
}: {
  recapDate: string;
  currentDate: string;
  actions: RecapPlanAction[];
  drafts: Record<string, RecapActionDraft>;
  activities: HistoricalActivity[];
  onDraftChange: (
    actionId: string,
    update: Partial<RecapActionDraft>,
  ) => void;
  onDeleteActivity: (activityId: string) => void;
  onAddActivity?: (activity: HistoricalActivity) => void;
  onUpdateActivity?: (activity: HistoricalActivity) => void;
  onAddMissing?: (entry: {
    localDate: string | null;
    description: string;
  }) => void | Promise<void>;
  continueType?: "submit" | "button";
  onContinue?: () => void;
  error?: string | null;
  heading?: string;
  supportingCopy?: string;
  afterActionSections?: React.ReactNode;
  dayContext?: string;
  onDayContextChange?: (value: string) => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  reviewSectionHeading?: string;
}) {
  const [openActionId, setOpenActionId] = useState<string | null>(
    () =>
      actions.find(
        (action) => !isRecapDraftResolved(drafts[action.id]),
      )?.id ?? null,
  );
  const [reviewDetailsOpen, setReviewDetailsOpen] = useState(true);
  const [editingActivityId, setEditingActivityId] = useState<
    string | "new" | null
  >(null);
  const [addingMissing, setAddingMissing] = useState(false);
  const [missingDay, setMissingDay] = useState(() =>
    addLocalDays(recapDate, 1) === currentDate ? recapDate : "",
  );
  const [missingDescription, setMissingDescription] = useState("");
  const [missingError, setMissingError] = useState<string | null>(null);
  const [addingMissingPending, setAddingMissingPending] =
    useState(false);
  const [plansChangedOpen, setPlansChangedOpen] = useState(false);
  const [plansChangedDraft, setPlansChangedDraft] = useState("");
  const [internalDayContext, setInternalDayContext] = useState("");
  const actionElements = useRef(
    new Map<string, HTMLDivElement>(),
  );
  const day = formatWeekday(recapDate);
  const currentDay = formatWeekday(currentDate);
  const nextDayReturn = addLocalDays(recapDate, 1) === currentDate;
  const unresolved = actions.filter(
    (action) => !isRecapDraftResolved(drafts[action.id]),
  );
  const unresolvedCount = unresolved.length;
  const allResolved = unresolvedCount === 0;
  const detailsVisible = !allResolved || reviewDetailsOpen;
  const actionWord = unresolvedCount === 1 ? "action" : "actions";
  const verb = unresolvedCount === 1 ? "needs" : "need";
  const outcomeCounts = countOutcomes(actions, drafts);
  const contextValue = dayContext ?? internalDayContext;

  function updateDayContext(value: string) {
    setInternalDayContext(value);
    onDayContextChange?.(value);
  }

  function resolveAction(
    action: RecapPlanAction,
    update: Partial<RecapActionDraft>,
  ) {
    setPlansChangedOpen(false);
    onDraftChange(action.id, {
      ...update,
      outcomeConfirmed: true,
    });

    const currentIndex = actions.findIndex(
      (candidate) => candidate.id === action.id,
    );
    const orderedCandidates = [
      ...actions.slice(currentIndex + 1),
      ...actions.slice(0, currentIndex),
    ];
    const next = orderedCandidates.find(
      (candidate) =>
        candidate.id !== action.id &&
        !isRecapDraftResolved(drafts[candidate.id]),
    );

    const nextActionId = next?.id ?? null;
    setOpenActionId(nextActionId);

    if (nextActionId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollIntoViewIfNeeded(
            actionElements.current.get(nextActionId),
          );
        });
      });
    }
  }

  function renderAction(
    action: RecapPlanAction,
    subdued: boolean,
  ) {
    return (
      <div
        key={action.id}
        ref={(node) => {
          if (node) {
            actionElements.current.set(action.id, node);
          } else {
            actionElements.current.delete(action.id);
          }
        }}
      >
        <RecapActionPanel
          key={`${action.id}:${
            drafts[action.id].outcomeConfirmed
              ? drafts[action.id].outcome
              : "review"
          }`}
          title={action.title}
          draft={drafts[action.id]}
          open={openActionId === action.id}
          subdued={subdued}
          onToggle={() => {
            setPlansChangedOpen(false);
            setAddingMissing(false);
            setEditingActivityId(null);
            setOpenActionId((current) =>
              current === action.id ? null : action.id,
            );
          }}
          onDraftChange={(update) =>
            onDraftChange(action.id, update)
          }
          onResolve={(update) => resolveAction(action, update)}
        />
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {formatFullLocalDate(recapDate)}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          {heading ?? `Recap ${day}`}
        </h1>
        {(supportingCopy || !allResolved) && (
          <p className="leading-6 text-muted-foreground">
            {supportingCopy ??
              (nextDayReturn
                ? `${unresolvedCount} ${actionWord} ${verb} a quick check before Clarity shapes ${currentDay}.`
                : `${unresolvedCount} ${actionWord} ${verb} a quick check before Clarity catches up and shapes ${currentDay}.`)}
          </p>
        )}
      </header>

      <section className="space-y-2.5">
        {allResolved ? (
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <h2 className="font-semibold">Ready to save {day}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {outcomeSummary(outcomeCounts)}
            </p>
            <Button
              type="button"
              variant="ghost"
              aria-expanded={reviewDetailsOpen}
              aria-controls="recap-action-details"
              onClick={() => {
                if (reviewDetailsOpen) {
                  setOpenActionId(null);
                }
                setReviewDetailsOpen((current) => !current);
                setAddingMissing(false);
                setEditingActivityId(null);
              }}
              className="mt-1 h-10 rounded-xl px-0 text-muted-foreground"
            >
              {reviewDetailsOpen ? "Hide details" : "Review details"}
              <ChevronDown
                className={`size-4 transition-transform motion-reduce:transition-none ${
                  reviewDetailsOpen ? "rotate-180" : ""
                }`}
              />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {reviewSectionHeading ??
                  `Needs review · ${unresolvedCount}`}
              </h2>
              {unresolvedCount >= 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (plansChangedOpen) {
                      setPlansChangedOpen(false);
                      return;
                    }

                    setPlansChangedDraft(contextValue);
                    setPlansChangedOpen(true);
                  }}
                  className="h-10 shrink-0 rounded-xl px-2 text-sm text-muted-foreground"
                >
                  Rest of the day changed?
                </Button>
              )}
            </div>
            {plansChangedOpen && unresolvedCount >= 2 && (
              <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <h3 className="font-semibold">What happened?</h3>
                <Textarea
                  aria-label="What happened?"
                  value={plansChangedDraft}
                  maxLength={500}
                  onChange={(event) =>
                    setPlansChangedDraft(event.currentTarget.value)
                  }
                  placeholder="I spent the day in hospital, plans changed, I was unwell, or something else took over..."
                  className="min-h-20 rounded-xl"
                />
                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!plansChangedDraft.trim()}
                    onClick={() => {
                      const explanation = plansChangedDraft;

                      if (!explanation.trim()) {
                        return;
                      }

                      updateDayContext(explanation);
                      unresolved.forEach((action) => {
                        onDraftChange(action.id, {
                          outcome: "not_done",
                          outcomeConfirmed: true,
                          notDoneNote: explanation,
                        });
                      });
                      setOpenActionId(null);
                      setPlansChangedOpen(false);
                    }}
                    className="min-h-11 rounded-xl"
                  >
                    Mark remaining as didn&apos;t happen
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPlansChangedDraft(contextValue);
                      setPlansChangedOpen(false);
                    }}
                    className="h-10 rounded-xl"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <div
          id="recap-action-details"
          aria-hidden={!detailsVisible}
          inert={detailsVisible ? undefined : true}
          className={`grid transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none ${
            detailsVisible
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-2">
              {actions.map((action) =>
                renderAction(
                  action,
                  isRecapDraftResolved(drafts[action.id]),
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <RecapDayContextField
        key={`day-context-${contextValue}`}
        day={day}
        value={contextValue}
        onChange={updateDayContext}
      />

      {afterActionSections}

      {activities.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Also recorded {day}
          </h2>
          {activities.map((activity) =>
            editingActivityId === activity.id && onUpdateActivity ? (
              <HistoricalActivityForm
                key={activity.id}
                day={day}
                initialActivity={activity}
                onSave={(updated) => {
                  onUpdateActivity(updated);
                  setEditingActivityId(null);
                }}
                onCancel={() => setEditingActivityId(null)}
              />
            ) : (
              <article
                key={activity.id}
                className="rounded-2xl border border-border bg-card px-4 py-3"
              >
                <p className="font-semibold">{activity.title}</p>
                <p className="mt-0.5 text-sm text-[var(--clarity-completed)]">
                  {historicalActivityLabel(activity)}
                </p>
                <div className="mt-1 flex gap-1">
                  {onUpdateActivity && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOpenActionId(null);
                        setAddingMissing(false);
                        setEditingActivityId(activity.id);
                      }}
                      className="h-9 px-2 text-xs text-muted-foreground"
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteActivity(activity.id)}
                    className="h-9 px-2 text-xs text-destructive hover:text-destructive"
                  >
                    Delete entry
                  </Button>
                </div>
              </article>
            ),
          )}
        </section>
      )}

      {nextDayReturn && onAddActivity && editingActivityId === "new" && (
        <HistoricalActivityForm
          day={day}
          onSave={(activity) => {
            onAddActivity(activity);
            setEditingActivityId(null);
          }}
          onCancel={() => setEditingActivityId(null)}
        />
      )}

      {nextDayReturn && onAddActivity && editingActivityId !== "new" && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpenActionId(null);
            setAddingMissing(false);
            setEditingActivityId("new");
          }}
          className="h-11 w-full justify-start rounded-xl px-2 text-muted-foreground"
        >
          + Add something that happened {day}
        </Button>
      )}

      {!nextDayReturn && allResolved && onAddMissing && addingMissing ? (
        <section className="space-y-4 border-t border-border/70 pt-4">
          <header className="space-y-1.5">
            <h2 className="font-semibold">What did Clarity miss?</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {nextDayReturn
                ? `Add anything meaningful that happened ${day} but was not in the plan.`
                : "Add anything meaningful from while you were away that Clarity missed."}
            </p>
          </header>
          {!nextDayReturn && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">
                Day <span className="font-normal text-muted-foreground">(optional)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {returnDayOptions(recapDate, currentDate).map(
                  (option) => (
                    <button
                      key={option.value || "unsure"}
                      type="button"
                      aria-pressed={missingDay === option.value}
                      onClick={() => setMissingDay(option.value)}
                      className={`min-h-11 rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        missingDay === option.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  ),
                )}
              </div>
            </fieldset>
          )}
          <label className="block">
            <span className="sr-only">
              Describe what Clarity missed
            </span>
            <Textarea
              value={missingDescription}
              maxLength={500}
              onChange={(event) => {
                setMissingDescription(event.currentTarget.value);
                setMissingError(null);
              }}
              className="min-h-24 rounded-xl"
            />
          </label>
          {missingError && (
            <p role="alert" className="text-sm text-destructive">
              {missingError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={addingMissingPending}
              onClick={() => {
                setAddingMissing(false);
                setMissingDescription("");
                setMissingDay(nextDayReturn ? recapDate : "");
                setMissingError(null);
              }}
              className="h-11 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !missingDescription.trim() || addingMissingPending
              }
              onClick={async () => {
                const description = missingDescription.trim();

                if (!description) {
                  setMissingError("Describe what Clarity missed.");
                  return;
                }

                setAddingMissingPending(true);

                try {
                  await onAddMissing({
                    localDate: nextDayReturn
                      ? recapDate
                      : missingDay || null,
                    description,
                  });
                  setAddingMissing(false);
                  setMissingDescription("");
                  setMissingDay(nextDayReturn ? recapDate : "");
                  setMissingError(null);
                } catch {
                  setMissingError(
                    "Couldn’t add that context. Try again.",
                  );
                } finally {
                  setAddingMissingPending(false);
                }
              }}
              className="h-11 rounded-xl"
            >
              {addingMissingPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </section>
      ) : !nextDayReturn && allResolved && onAddMissing ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpenActionId(null);
            setAddingMissing(true);
          }}
          className="h-11 w-full justify-start rounded-xl px-2 text-muted-foreground"
        >
          + Add something missing
        </Button>
      ) : null}

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-secondary px-4 py-3 text-sm leading-6"
        >
          {error}
        </p>
      )}

      <PendingButton
        type={continueType}
        size="lg"
        disabled={
          unresolvedCount > 0 ||
          continueDisabled
        }
        pendingLabel={
          nextDayReturn
            ? `Continuing to ${currentDay}…`
            : "Continuing…"
        }
        onClick={continueType === "button" ? onContinue : undefined}
        className="h-12 w-full rounded-xl text-base"
      >
        {continueLabel ??
          (nextDayReturn
            ? `Continue to ${currentDay}`
            : "Continue catching up")}
      </PendingButton>
    </section>
  );
}

function historicalActivityLabel(activity: HistoricalActivity) {
  if (activity.outcome === "finished") {
    return activity.completionTime && !activity.timeUnknown
      ? `Finished · ${formatLocalTimeLabel(activity.completionTime)}`
      : "Finished · Time not recorded";
  }

  return activity.progressNote
    ? `Made progress · ${shortText(activity.progressNote)}`
    : "Made progress";
}

function formatLocalTimeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const meridiem = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

export function isRecapDraftResolved(
  draft: RecapActionDraft | undefined,
) {
  if (!draft?.outcome) {
    return false;
  }

  if (!draft.outcomeConfirmed) {
    return false;
  }

  if (draft.outcome === "made_progress") {
    return progressExplanationError(draft.progressNote) === null;
  }

  if (draft.outcome === "not_done") {
    return Boolean(draft.notDoneNote.trim());
  }

  if (draft.outcome === "closed") {
    return Boolean(draft.closeReason);
  }

  return true;
}

function countOutcomes(
  actions: RecapPlanAction[],
  drafts: Record<string, RecapActionDraft>,
) {
  return actions.reduce(
    (counts, action) => {
      const outcome = drafts[action.id]?.outcome;

      if (outcome === "finished") counts.finished += 1;
      if (outcome === "made_progress") counts.progressed += 1;
      if (outcome === "closed") counts.closed += 1;
      if (
        outcome === "not_done" ||
        outcome === "resolved_elsewhere"
      ) {
        counts.notDone += 1;
      }

      return counts;
    },
    {
      finished: 0,
      progressed: 0,
      notDone: 0,
      closed: 0,
    },
  );
}

function outcomeSummary(counts: ReturnType<typeof countOutcomes>) {
  const parts: string[] = [];

  if (counts.finished > 0) {
    parts.push(`${counts.finished} done`);
  }

  if (counts.progressed > 0) {
    parts.push(`${counts.progressed} progressed`);
  }

  if (counts.notDone > 0) {
    parts.push(`${counts.notDone} didn’t happen`);
  }

  if (counts.closed > 0) {
    parts.push(`${counts.closed} removed`);
  }

  return parts.length > 0
    ? parts.join(" · ")
    : "No planned outcomes recorded";
}

function returnDayOptions(recapDate: string, currentDate: string) {
  const options: Array<{ value: string; label: string }> = [];
  let cursor = recapDate;

  while (cursor < currentDate) {
    options.push({
      value: cursor,
      label: formatWeekday(cursor),
    });
    cursor = addLocalDays(cursor, 1);
  }

  options.push({ value: "", label: "Not sure" });
  return options;
}

function shortText(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 64
    ? `${normalized.slice(0, 61).trimEnd()}…`
    : normalized;
}

function scrollIntoViewIfNeeded(element: HTMLElement | undefined) {
  if (!element) {
    return;
  }

  const container = nearestScrollableParent(element);
  const elementRect = element.getBoundingClientRect();
  const viewportTop = container
    ? container.getBoundingClientRect().top
    : 0;
  const viewportBottom = container
    ? container.getBoundingClientRect().bottom
    : window.innerHeight;

  if (
    elementRect.top >= viewportTop &&
    elementRect.bottom <= viewportBottom
  ) {
    return;
  }

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  element.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "nearest",
  });
}

function nearestScrollableParent(element: HTMLElement) {
  let parent = element.parentElement;

  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);

    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return null;
}
