"use client";

import {
  Check,
  ChevronDown,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useActionState, useState } from "react";

import {
  makeProposedActionEasierAction,
  removeProposedActionAction,
  updateActionAction,
} from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { ActionFields } from "./action-fields";
import { PendingButton } from "./pending-button";

export function ProposedActionCard({
  action,
  scheduledTime,
  scheduledTimeInput,
}: {
  action: DailyAction;
  scheduledTime: string | null;
  scheduledTimeInput: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(
    updateActionAction,
    initialDailyLoopActionState,
  );

  return (
    <article
      className={`overflow-hidden rounded-2xl border transition-colors ${
        expanded
          ? "border-[var(--clarity-completed)] bg-secondary"
          : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-6">{action.title}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {scheduledTime ? (
              <span className="font-semibold text-[var(--clarity-completed)]">
                {scheduledTime}
              </span>
            ) : (
              <span>{action.estimated_minutes} min</span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          Kept
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          {editing ? (
            <form action={formAction} className="space-y-5">
              <input type="hidden" name="actionId" value={action.id} />
              <ActionFields
                state={state}
                detailsRequired
                initialValues={{
                  title: action.title,
                  actionType: action.action_type,
                  estimatedMinutes: action.estimated_minutes,
                  scheduledTime: scheduledTimeInput,
                  whyItExists: action.why_it_exists,
                  definitionOfDone: action.definition_of_done,
                  suggestedMethod: action.suggested_method,
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
              {state.success && (
                <p className="text-sm text-[var(--clarity-completed)]">
                  {state.success}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
                  className="h-11 rounded-xl"
                >
                  {state.success ? "Done" : "Cancel"}
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
              <dl className="space-y-5 text-sm">
                <Detail
                  label="Done when"
                  value={action.definition_of_done}
                />
                <Detail
                  label="Best approach"
                  value={action.suggested_method}
                />
              </dl>

              <div className="mt-6">
                {!adjusting ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAdjusting(true)}
                    className="h-11 w-full rounded-xl"
                  >
                    <SlidersHorizontal />
                    Adjust
                  </Button>
                ) : (
                  <div className="grid gap-2 rounded-xl bg-card p-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditing(true)}
                      className="h-11 rounded-xl"
                    >
                      <Pencil />
                      Change it
                    </Button>
                    <form action={makeProposedActionEasierAction}>
                      <input type="hidden" name="actionId" value={action.id} />
                      <PendingButton
                        type="submit"
                        variant="outline"
                        pendingLabel="Making lighter…"
                        className="h-11 w-full rounded-xl"
                      >
                        <Sparkles />
                        Make it lighter
                      </PendingButton>
                    </form>
                    <form action={removeProposedActionAction}>
                      <input type="hidden" name="actionId" value={action.id} />
                      <PendingButton
                        type="submit"
                        variant="destructive"
                        pendingLabel="Removing…"
                        className="h-11 w-full rounded-xl"
                      >
                        <Trash2 />
                        Remove it
                      </PendingButton>
                    </form>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-foreground">{label}</dt>
      <dd className="mt-1 leading-6 text-muted-foreground">{value}</dd>
    </div>
  );
}
