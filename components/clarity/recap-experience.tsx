"use client";

import { Check, ChevronDown, CirclePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatFullLocalDate, formatWeekday } from "@/lib/clarity/date-time";
import { progressExplanationError } from "@/lib/clarity/recap-validation";
import { PendingButton } from "./pending-button";
import {
  RecapCompletedItemForm,
  type RecapCompletedItem,
} from "./recap-completed-item-form";
import {
  RecapActionPanel,
  type RecapActionDraft,
} from "./recap-action-panel";
import { RecapDayContextField } from "./recap-day-context-field";
import { SecondarySettingDisclosure } from "./secondary-setting-disclosure";
import { SwipeToRemove } from "./swipe-to-remove";

export type RecapPlanAction = {
  id: string;
  title: string;
  initiallyConfirmed: boolean;
};

export function RecapExperience({
  recapDate,
  actions,
  drafts,
  activities,
  onDraftChange,
  onDeleteActivity,
  onAddActivity,
  onUpdateActivity,
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
  onEditorActiveChange,
}: {
  recapDate: string;
  currentDate: string;
  actions: RecapPlanAction[];
  drafts: Record<string, RecapActionDraft>;
  activities: RecapCompletedItem[];
  onDraftChange: (
    actionId: string,
    update: Partial<RecapActionDraft>,
  ) => void;
  onDeleteActivity: (activityId: string) => void;
  onAddActivity?: (activity: RecapCompletedItem) => void;
  onUpdateActivity?: (activity: RecapCompletedItem) => void;
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
  onEditorActiveChange?: (active: boolean) => void;
}) {
  const [openActionId, setOpenActionId] = useState<string | null>(
    () =>
      actions.find(
        (action) => !isRecapDraftResolved(drafts[action.id]),
      )?.id ?? null,
  );
  const [auxiliaryPanel, setAuxiliaryPanel] = useState<string | null>(
    null,
  );
  const [plansChangedOpen, setPlansChangedOpen] = useState(false);
  const [plansChangedDraft, setPlansChangedDraft] = useState("");
  const [internalDayContext, setInternalDayContext] = useState("");
  const [editorFieldFocused, setEditorFieldFocused] = useState(false);
  const [swipedActivityId, setSwipedActivityId] = useState<
    string | null
  >(null);
  const actionElements = useRef(
    new Map<string, HTMLDivElement>(),
  );
  const day = formatWeekday(recapDate);
  const unresolved = actions.filter(
    (action) => !isRecapDraftResolved(drafts[action.id]),
  );
  const unresolvedCount = unresolved.length;
  const allResolved = unresolvedCount === 0;
  const actionWord = unresolvedCount === 1 ? "action" : "actions";
  const verb = unresolvedCount === 1 ? "needs" : "need";
  const contextValue = dayContext ?? internalDayContext;
  const auxiliaryEditorOpen =
    auxiliaryPanel === "note" ||
    auxiliaryPanel?.startsWith("completed:") === true;
  const recapEditorActive =
    editorFieldFocused || plansChangedOpen || auxiliaryEditorOpen;

  useEffect(() => {
    onEditorActiveChange?.(recapEditorActive);
  }, [onEditorActiveChange, recapEditorActive]);

  useEffect(
    () => () => {
      onEditorActiveChange?.(false);
    },
    [onEditorActiveChange],
  );

  useEffect(() => {
    if (!swipedActivityId) {
      return;
    }

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        setSwipedActivityId(null);
        return;
      }

      const swipedCard = target.closest<HTMLElement>(
        "[data-swipe-action-id]",
      );

      if (swipedCard?.dataset.swipeActionId !== swipedActivityId) {
        setSwipedActivityId(null);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [swipedActivityId]);

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
            setAuxiliaryPanel(null);
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

  function renderCompletedActivity(activity: RecapCompletedItem) {
    const panelId = `completed:${activity.id}`;
    const open = auxiliaryPanel === panelId;

    return (
      <SwipeToRemove
        key={activity.id}
        itemId={activity.id}
        itemTitle={activity.title}
        open={swipedActivityId === activity.id}
        onOpenChange={(swipeOpen) =>
          setSwipedActivityId(swipeOpen ? activity.id : null)
        }
        onRemove={() => {
          onDeleteActivity(activity.id);
          setSwipedActivityId(null);
          setAuxiliaryPanel((current) =>
            current === panelId ? null : current,
          );
        }}
        removalPending={false}
        removing={false}
        enabled
        accessibilityContext="from this recap"
      >
        <article
          data-slot="recap-activity-card"
          className="overflow-hidden rounded-2xl border border-border bg-card transition-colors motion-reduce:transition-none"
        >
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setSwipedActivityId(null);
              setOpenActionId(null);
              setPlansChangedOpen(false);
              setAuxiliaryPanel(open ? null : panelId);
            }}
            className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {activity.title}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-sm text-[var(--clarity-completed)]">
                <Check aria-hidden="true" className="size-3.5 shrink-0" />
                {`Done · ${
                  activity.completionTime
                    ? formatLocalTimeLabel(activity.completionTime)
                    : "Anytime"
                }`}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            aria-hidden={!open}
            inert={!open ? true : undefined}
            className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div className="space-y-3 border-t border-border px-3 py-3">
                {onUpdateActivity && (
                  <RecapCompletedItemForm
                    embedded
                    initialItem={activity}
                    submitLabel="Save"
                    onSave={(updated) => {
                      onUpdateActivity(updated);
                      setAuxiliaryPanel(null);
                    }}
                    onCancel={() => setAuxiliaryPanel(null)}
                  />
                )}
              </div>
            </div>
          </div>
        </article>
      </SwipeToRemove>
    );
  }

  return (
    <section
      className="space-y-5"
      onFocusCapture={(event) => {
        if (isEditorField(event.target)) {
          setEditorFieldFocused(true);
        }
      }}
      onBlurCapture={(event) => {
        if (!isEditorField(event.relatedTarget)) {
          setEditorFieldFocused(false);
        }
      }}
    >
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
              `${unresolvedCount} ${actionWord} ${verb} a quick check before you continue.`}
          </p>
        )}
      </header>

      <section className="space-y-2.5">
        {unresolvedCount >= 2 && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                aria-expanded={plansChangedOpen}
                aria-controls="remaining-actions-bulk-outcome"
                onClick={() => {
                  if (plansChangedOpen) {
                    setPlansChangedOpen(false);
                    return;
                  }

                  setAuxiliaryPanel(null);
                  setPlansChangedDraft(contextValue);
                  setPlansChangedOpen(true);
                }}
                className="h-10 shrink-0 rounded-xl px-2 text-sm text-muted-foreground"
              >
                Mark remaining as didn&apos;t happen
              </Button>
            </div>
            {plansChangedOpen && (
              <div
                id="remaining-actions-bulk-outcome"
                className="space-y-3 rounded-2xl border border-border bg-card p-4"
              >
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
        <div className="space-y-2">
          {actions.map((action) =>
            renderAction(
              action,
              isRecapDraftResolved(drafts[action.id]),
            ),
          )}
          {activities.map(renderCompletedActivity)}
        </div>
      </section>

      <section className="space-y-2">
        {onAddActivity && (
          <SecondarySettingDisclosure
            icon={CirclePlus}
            label="Add something completed"
            summary="Something you did that wasn't planned"
            expanded={auxiliaryPanel === "completed:new"}
            onExpandedChange={(open) => {
              if (open) {
                setOpenActionId(null);
                setPlansChangedOpen(false);
                setAuxiliaryPanel("completed:new");
              } else {
                setAuxiliaryPanel(null);
              }
            }}
            showDone={false}
          >
            <RecapCompletedItemForm
              embedded
              submitLabel="Save"
              onSave={(activity) => {
                onAddActivity(activity);
                setAuxiliaryPanel(null);
              }}
              onCancel={() => setAuxiliaryPanel(null)}
            />
          </SecondarySettingDisclosure>
        )}

        <RecapDayContextField
          day={day}
          value={contextValue}
          open={auxiliaryPanel === "note"}
          onOpenChange={(open) => {
            if (open) {
              setOpenActionId(null);
              setPlansChangedOpen(false);
              setAuxiliaryPanel("note");
            } else {
              setAuxiliaryPanel(null);
            }
          }}
          onChange={updateDayContext}
        />
      </section>

      {afterActionSections}

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
          continueDisabled ||
          auxiliaryPanel?.startsWith("completed:")
        }
        pendingLabel={`Saving ${day}…`}
        onClick={continueType === "button" ? onContinue : undefined}
        className="h-12 w-full rounded-xl text-base"
      >
        {continueLabel ?? `Save ${day} and continue`}
      </PendingButton>
    </section>
  );
}

function isEditorField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.matches('input:not([type="hidden"]), textarea, select')
  );
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
