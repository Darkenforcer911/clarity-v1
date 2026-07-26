"use client";

import { useActionState, useState } from "react";
import { CalendarDays, CheckCircle2, CircleOff, MoveRight } from "lucide-react";

import { finishDayAction } from "@/app/(app)/today/actions";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
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
  completedActions: DailyAction[];
  unfinishedActions: DailyAction[];
  tomorrow: string;
};

export function CloseDayForm({
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
    <form action={formAction} className="space-y-7">
      {completedActions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-100/60">
            Completed
          </h2>
          <div className="rounded-3xl border border-sky-200/15 bg-[#0c2b62]/90 p-5">
            <ul className="space-y-3">
              {completedActions.map((action) => (
                <li key={action.id} className="flex items-center gap-3">
                  <CheckCircle2 className="size-5 shrink-0 text-sky-300" />
                  <span>{action.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.025em]">
            Resolve unfinished actions
          </h2>
          <p className="mt-1 text-sm leading-6 text-blue-100/60">
            Choose exactly one outcome for each action before finishing.
          </p>
        </div>

        {unfinishedActions.length === 0 ? (
          <div className="rounded-3xl bg-sky-300/10 p-5 text-[#38a5ff]">
            Every action is complete. Nothing needs to be moved or dropped.
          </div>
        ) : (
          <div className="space-y-4">
            {unfinishedActions.map((action) => {
              const selection = selections[action.id];

              return (
                <article
                  key={action.id}
                  className="rounded-3xl border border-sky-200/15 bg-[#0c2b62]/90 p-5 shadow-sm"
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
                  <p className="mt-1 text-sm text-blue-100/55">
                    {action.estimated_minutes} minutes
                  </p>

                  <div className="mt-5 grid grid-cols-3 gap-2">
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
                    <div className="mt-4 space-y-2">
                      <Label htmlFor={`date-${action.id}`}>Move to</Label>
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
                        className="h-11 rounded-xl"
                      />
                    </div>
                  )}

                  <div className="mt-4 space-y-2">
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
        )}
      </section>

      <section className="space-y-3">
        <Label htmlFor="notes">Anything else Clarity should remember?</Label>
        <Textarea
          id="notes"
          name="notes"
          maxLength={5000}
          placeholder="A useful note about today."
          className="bg-[#0c2b62]/90"
        />
      </section>

      {state.error && (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <PendingButton
        type="submit"
        size="lg"
        disabled={!canFinish}
        pendingLabel="Finishing your day…"
        className="h-12 w-full rounded-xl bg-[#148bff] text-base hover:bg-[#0877e0]"
      >
        Finish day
        <MoveRight />
      </PendingButton>
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
      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-xs font-medium transition ${
        active
          ? "border-[#38a5ff] bg-sky-300/10 text-[#38a5ff]"
          : "border-sky-200/20 bg-[#0c2b62]/90 text-blue-100/60 hover:border-[#38a5ff]/40"
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
