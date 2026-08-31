"use client";

import { useActionState, useState } from "react";
import { CalendarDays, CheckCircle2, CircleOff, MoveRight } from "lucide-react";

import {
  cancelCloseDayAction,
  finishDayAction,
} from "@/app/(app)/today/actions";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { formatDuration } from "@/lib/clarity/duration";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PendingButton } from "./pending-button";

type Outcome = "" | "tomorrow" | "choose_date" | "drop";

type Selection = {
  outcome: Outcome;
  selectedDate: string;
  resolutionNote: string;
};

type CloseDayFormProps = {
  planId: string;
  completedActions: DailyAction[];
  unfinishedActions: DailyAction[];
  tomorrow: string;
};

export function CloseDayForm({
  planId,
  completedActions,
  unfinishedActions,
  tomorrow,
}: CloseDayFormProps) {
  const [state, formAction] = useActionState(
    finishDayAction,
    initialDailyLoopActionState,
  );
  const [selections, setSelections] = useState<Record<string, Selection>>(() =>
    Object.fromEntries(
      unfinishedActions.map((action) => [
        action.id,
        initialSelection(action, tomorrow),
      ]),
    ),
  );
  const canFinish = unfinishedActions.every((action) => {
    const selection = selections[action.id];
    return (
      selection?.outcome &&
      (selection.outcome !== "choose_date" || selection.selectedDate)
    );
  });

  const updateSelection = (
    actionId: string,
    update: Partial<Selection>,
  ) => {
    setSelections((current) => ({
      ...current,
      [actionId]: { ...current[actionId], ...update },
    }));
  };

  return (
    <form
      action={formAction}
      className="w-full min-w-0 max-w-full space-y-7 pb-2"
    >
      <input type="hidden" name="planId" value={planId} />
      {completedActions.length > 0 && (
        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Completed
          </h2>
          <div className="w-full min-w-0 max-w-full rounded-2xl border border-border bg-card p-5">
            <ul className="space-y-3">
              {completedActions.map((action) => (
                <li key={action.id} className="flex items-center gap-3">
                  <CheckCircle2 className="size-5 shrink-0 text-[var(--clarity-completed)]" />
                  <span>{action.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {unfinishedActions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 leading-7 text-[var(--clarity-completed)]">
          Everything in today&apos;s approved plan was completed. Nothing needs
          to be resolved.
        </div>
      ) : (
        <section className="min-w-0 space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.025em]">
              Resolve unfinished actions
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Choose exactly one outcome for each action before finishing.
            </p>
          </div>
          <div className="w-full min-w-0 max-w-full space-y-4">
            {unfinishedActions.map((action) => {
              const selection = selections[action.id];

              return (
                <article
                  key={action.id}
                  className="w-full min-w-0 max-w-full rounded-2xl border border-border bg-card p-5 shadow-sm"
                >
                  <input type="hidden" name="actionId" value={action.id} />
                  <input
                    type="hidden"
                    name={`outcome:${action.id}`}
                    value={selection.outcome}
                  />
                  <input
                    type="hidden"
                    name={`selectedDate:${action.id}`}
                    value={selection.selectedDate}
                  />
                  <h3 className="font-semibold tracking-[-0.015em]">
                    {action.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDuration(action.estimated_minutes)}
                  </p>

                  <div className="mt-5 grid min-w-0 grid-cols-3 gap-2">
                    <OutcomeButton
                      active={selection.outcome === "tomorrow"}
                      onClick={() =>
                        updateSelection(action.id, {
                          outcome: "tomorrow",
                          selectedDate: tomorrow,
                        })
                      }
                    >
                      Tomorrow
                    </OutcomeButton>
                    <OutcomeButton
                      active={selection.outcome === "choose_date"}
                      onClick={() =>
                        updateSelection(action.id, {
                          outcome: "choose_date",
                          selectedDate: selection.selectedDate || tomorrow,
                        })
                      }
                    >
                      Choose date
                    </OutcomeButton>
                    <OutcomeButton
                      active={selection.outcome === "drop"}
                      onClick={() =>
                        updateSelection(action.id, {
                          outcome: "drop",
                          selectedDate: "",
                        })
                      }
                    >
                      Drop
                    </OutcomeButton>
                  </div>

                  {selection.outcome === "choose_date" && (
                    <div className="mt-4 w-full min-w-0 max-w-full space-y-2">
                      <Label htmlFor={`date-${action.id}`}>Move to</Label>
                      <div className="native-date-time-wrapper">
                        <Input
                          id={`date-${action.id}`}
                          type="date"
                          min={tomorrow}
                          value={selection.selectedDate}
                          onChange={(event) =>
                            updateSelection(action.id, {
                              selectedDate: event.target.value,
                            })
                          }
                          className="h-11 w-full min-w-0 max-w-full rounded-xl"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 w-full min-w-0 max-w-full space-y-2">
                    <Label htmlFor={`note-${action.id}`}>
                      Resolution note <span className="font-normal">(optional)</span>
                    </Label>
                    <Input
                      id={`note-${action.id}`}
                      name={`resolutionNote:${action.id}`}
                      value={selection.resolutionNote}
                      placeholder="Anything worth carrying forward?"
                      onChange={(event) =>
                        updateSelection(action.id, {
                          resolutionNote: event.target.value,
                        })
                      }
                      className="h-11 rounded-xl"
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="min-w-0 space-y-3">
        <Label htmlFor="notes">Anything else Clarity should remember?</Label>
        <Textarea
          id="notes"
          name="notes"
          maxLength={5000}
          placeholder="A useful note about today."
          className="bg-card"
        />
      </section>

      {state.error && (
        <p
          className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div className="grid gap-3">
        <PendingButton
          type="submit"
          formAction={cancelCloseDayAction}
          variant="outline"
          size="lg"
          pendingLabel="Returning to Today…"
          className="h-12 w-full rounded-xl text-base"
        >
          Back to Today
        </PendingButton>
        <PendingButton
          type="submit"
          size="lg"
          disabled={!canFinish}
          pendingLabel="Finishing your day…"
          className="h-12 w-full rounded-xl text-base"
        >
          Finish day
          <MoveRight />
        </PendingButton>
      </div>
    </form>
  );
}

function OutcomeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active && children === "Drop"
          ? "border-destructive bg-card text-foreground"
          : active
          ? "border-[var(--clarity-completed)] bg-secondary text-[var(--clarity-completed)]"
          : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children === "Tomorrow" ? (
        <CalendarDays className="size-4" />
      ) : children === "Drop" ? (
        <CircleOff className="size-4" />
      ) : (
        <CalendarDays className="size-4" />
      )}
      {children}
    </button>
  );
}

function initialSelection(
  action: DailyAction,
  tomorrow: string,
): Selection {
  if (action.status === "dropped") {
    return {
      outcome: "drop",
      selectedDate: "",
      resolutionNote: action.resolution_note ?? "",
    };
  }

  if (action.status === "rescheduled" && action.rescheduled_for) {
    return {
      outcome:
        action.rescheduled_for === tomorrow ? "tomorrow" : "choose_date",
      selectedDate: action.rescheduled_for,
      resolutionNote: action.resolution_note ?? "",
    };
  }

  return {
    outcome: "",
    selectedDate: "",
    resolutionNote: "",
  };
}
