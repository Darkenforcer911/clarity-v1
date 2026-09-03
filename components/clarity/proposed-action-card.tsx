"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { updateActionAction } from "@/app/(app)/today/action-workspace-actions";
import { completeProposedActionFromPlanAction } from "@/app/(app)/today/reconciliation-actions";
import { Button } from "@/components/ui/button";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { initialProposedReconciliationActionState } from "@/lib/clarity/proposed-reconciliation-state";
import {
  getProposedDateBoundary,
  getProposedDateBoundaryPresentation,
} from "@/lib/clarity/proposed-date-boundary";
import { formatDuration } from "@/lib/clarity/duration";
import { ActionFields } from "./action-fields";
import { PendingButton } from "./pending-button";
import { TimedDayItemSummary } from "./timed-day-item-summary";

export function ProposedActionCard({
  action,
  scheduledTime,
  scheduledTimeInput,
  timePassed,
  expanded,
  onToggle,
  onCollapse,
  onRemove,
  reorderControl,
  reordering = false,
  planLocalDate,
  currentLocalDate,
  timezone,
}: {
  action: DailyAction;
  scheduledTime: string | null;
  scheduledTimeInput: string;
  timePassed: boolean;
  expanded: boolean;
  onToggle: (actionId: string) => void;
  onCollapse: (actionId: string) => void;
  onRemove: (actionId: string) => void;
  reorderControl: ReactNode;
  reordering?: boolean;
  planLocalDate: string;
  currentLocalDate: string;
  timezone: string;
}) {
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showCompletionTime, setShowCompletionTime] = useState(false);
  const [showUpdateConfirmation, setShowUpdateConfirmation] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const [state, formAction] = useActionState(
    updateActionAction,
    initialDailyLoopActionState,
  );
  const [completionState, completionAction] = useActionState(
    completeProposedActionFromPlanAction,
    initialProposedReconciliationActionState,
  );
  const userEnteredDetails = getUserEnteredDetails(action.why_it_exists);
  const dateBoundary =
    getProposedDateBoundary(planLocalDate, currentLocalDate) ??
    completionState.dateBoundary ??
    null;
  const dateBoundaryPresentation = dateBoundary
    ? getProposedDateBoundaryPresentation(dateBoundary)
    : null;

  useEffect(() => {
    if (!state.updateSucceededAt) {
      return;
    }

    const previousCardTop = cardRef.current?.getBoundingClientRect().top;
    const previousScrollY = window.scrollY;

    let restoreFrame = 0;
    const collapseFrame = window.requestAnimationFrame(() => {
      setEditing(false);
      onCollapse(action.id);
      setShowUpdateConfirmation(true);

      restoreFrame = window.requestAnimationFrame(() => {
        const currentCardTop = cardRef.current?.getBoundingClientRect().top;

        if (previousCardTop !== undefined && currentCardTop !== undefined) {
          window.scrollBy({
            top: currentCardTop - previousCardTop,
            behavior: "auto",
          });
        } else {
          window.scrollTo({ top: previousScrollY, behavior: "auto" });
        }
      });
    });
    const timer = window.setTimeout(() => {
      setShowUpdateConfirmation(false);
    }, 2400);

    return () => {
      window.cancelAnimationFrame(collapseFrame);
      window.cancelAnimationFrame(restoreFrame);
      window.clearTimeout(timer);
    };
  }, [action.id, onCollapse, state.updateSucceededAt]);

  return (
    <article
      ref={cardRef}
      data-proposed-action-card
      className={`overflow-hidden rounded-2xl border transition-colors duration-200 motion-reduce:transition-none ${
        expanded
          ? "border-[var(--clarity-completed)] bg-secondary"
          : "border-border bg-card"
      }`}
    >
      <ProposedActionCompactCard
        action={action}
        scheduledTime={scheduledTime}
        timePassed={timePassed}
        expanded={expanded}
        disabled={reordering}
        reorderControl={reorderControl}
        onToggle={() => onToggle(action.id)}
      />

      {!reordering && showUpdateConfirmation && !expanded && (
        <p
          role="status"
          aria-live="polite"
          className="border-t border-border px-5 py-2.5 text-sm font-medium text-[var(--clarity-completed)]"
        >
          Action updated
        </p>
      )}

      {!reordering && (
        <div
          aria-hidden={!expanded}
          inert={!expanded}
          className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border px-5 pb-5 pt-4">
            {dateBoundaryPresentation ? (
              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                <div className="space-y-2">
                  <p className="font-semibold">
                    {dateBoundaryPresentation.heading}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {dateBoundaryPresentation.message}
                  </p>
                </div>
                <Button asChild className="h-11 w-full rounded-xl">
                  <Link href={dateBoundaryPresentation.actionHref}>
                    {dateBoundaryPresentation.actionLabel} <ArrowRight />
                  </Link>
                </Button>
              </div>
            ) : editing ? (
              <form action={formAction} className="space-y-5">
                <input type="hidden" name="actionId" value={action.id} />
                <ActionFields
                  state={state}
                  simple
                  hideGeneratedDetails
                  showRecurrence
                  localDate={action.local_date}
                  timezone={timezone}
                  initialValues={{
                    title: action.title,
                    actionType: action.action_type,
                    estimatedMinutes: action.estimated_minutes,
                    scheduledTime: scheduledTimeInput,
                    whyItExists: action.why_it_exists,
                    definitionOfDone: action.definition_of_done,
                    suggestedMethod: action.suggested_method,
                    context: userEnteredDetails ?? "",
                    details: action.details ?? userEnteredDetails ?? "",
                    dueLocalDate: action.due_local_date ?? "",
                    dueLocalTime: action.due_local_time?.slice(0, 5) ?? "",
                    reminderOffsets: action.reminder_offsets_minutes,
                    recurrencePattern: action.routine?.cadence ?? "none",
                    recurrenceDays: action.routine?.weekdays ?? [],
                  }}
                />
                {state.error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-border bg-card px-4 py-3 text-sm"
                  >
                    {state.error}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                    className="h-11 rounded-xl"
                  >
                    Cancel
                  </Button>
                  <PendingButton
                    type="submit"
                    pendingLabel="Saving…"
                    className="h-11 rounded-xl"
                  >
                    Save changes
                  </PendingButton>
                </div>
              </form>
            ) : (
              <>
                {timePassed && (
                  <div className="mb-5 space-y-3 rounded-xl border border-border bg-card p-4">
                    <p className="text-sm leading-6 text-secondary-foreground">
                      This scheduled time has already passed.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowUpdateConfirmation(false);
                          setCompleting(false);
                          setEditing(true);
                        }}
                        className="h-11 rounded-xl"
                      >
                        Change time
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setEditing(false);
                          setCompleting(true);
                        }}
                        className="h-11 w-full rounded-xl"
                      >
                        Already done
                      </Button>
                    </div>
                  </div>
                )}
                {completing && (
                  <form
                    action={completionAction}
                    data-reconciliation-form
                    className="mb-5 space-y-4 rounded-xl border border-border bg-card p-4"
                  >
                    <input type="hidden" name="actionId" value={action.id} />
                    <p className="font-medium">Mark as already done?</p>
                    {!showCompletionTime ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowCompletionTime(true)}
                        className="h-10 w-auto px-2 text-muted-foreground"
                      >
                        + Add time
                      </Button>
                    ) : (
                      <label className="block min-w-0 space-y-2 text-sm font-medium">
                        <span>Completion time</span>
                        <input
                          type="time"
                          name="completedTime"
                          defaultValue={timePassed ? scheduledTimeInput : ""}
                          className="flex h-11 min-w-0 w-full max-w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none [box-sizing:border-box] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        />
                      </label>
                    )}
                    {completionState.error && (
                      <p role="alert" className="text-sm text-foreground">
                        {completionState.error}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setCompleting(false);
                          setShowCompletionTime(false);
                        }}
                        className="h-11 rounded-xl"
                      >
                        Cancel
                      </Button>
                      <PendingButton
                        type="submit"
                        pendingLabel="Completing…"
                        className="h-11 rounded-xl"
                      >
                        Confirm
                      </PendingButton>
                    </div>
                  </form>
                )}
                {userEnteredDetails && (
                  <dl className="text-sm">
                    <Detail label="Details" value={userEnteredDetails} />
                  </dl>
                )}

                <div
                  className={`grid min-w-0 gap-3 ${
                    userEnteredDetails
                      ? "mt-6 border-t border-border pt-5"
                      : ""
                  }`}
                >
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowUpdateConfirmation(false);
                      setCompleting(false);
                      setEditing(true);
                    }}
                    className="h-11 w-full rounded-xl"
                  >
                    <Pencil />
                    Edit action
                  </Button>
                  {!timePassed && !completing && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditing(false);
                        setCompleting(true);
                      }}
                      className="h-10 w-auto justify-start rounded-lg px-2 text-muted-foreground"
                    >
                      <Check /> Already done
                    </Button>
                  )}
                  {!completing && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onRemove(action.id)}
                      className="h-10 w-auto justify-start rounded-lg px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 /> Remove from plan
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      )}
    </article>
  );
}

function ProposedActionCompactCard({
  action,
  scheduledTime,
  timePassed,
  expanded = false,
  disabled = false,
  reorderControl,
  onToggle,
}: {
  action: Pick<DailyAction, "title" | "estimated_minutes">;
  scheduledTime: string | null;
  timePassed: boolean;
  expanded?: boolean;
  disabled?: boolean;
  reorderControl?: ReactNode;
  onToggle?: () => void;
}) {
  const content = (
    <>
      {scheduledTime ? (
        <TimedDayItemSummary
          title={action.title}
          meta={`${scheduledTime} · ${formatDuration(action.estimated_minutes)}`}
          status={timePassed ? "Needs outcome" : null}
          disclosure
          expanded={expanded}
        />
      ) : (
        <>
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-6">{action.title}</span>
            <span className="mt-2 block text-sm text-muted-foreground">
              {formatDuration(action.estimated_minutes)}
            </span>
          </span>
          <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Kept
            <ChevronDown
              className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
            />
          </span>
        </>
      )}
    </>
  );

  return (
    <div
      data-proposed-action-compact
      className={`flex items-start ${reorderControl ? "gap-0 pl-3" : ""}`}
    >
      {reorderControl && (
        <div className="w-11 shrink-0 pt-3">{reorderControl}</div>
      )}
      {disabled ? (
        <div
          data-proposed-action-header
          className={`flex min-w-0 flex-1 items-start gap-3 text-left ${scheduledTime ? "p-4" : "py-5 pr-5"}`}
        >
          {content}
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-expanded={expanded}
          data-proposed-action-header
          className={`flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${scheduledTime ? "p-4" : "py-5 pr-5"}`}
        >
          {content}
        </button>
      )}
    </div>
  );
}

function getUserEnteredDetails(value: string) {
  const prefix = "Context: ";

  if (!value.startsWith(prefix)) {
    return null;
  }

  return value.slice(prefix.length).trim() || null;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-foreground">{label}</dt>
      <dd className="mt-1 leading-6 text-muted-foreground">{value}</dd>
    </div>
  );
}
