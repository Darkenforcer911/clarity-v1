"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatFullLocalDate,
  formatWeekday,
} from "@/lib/clarity/date-time";
import type {
  ReturnRecapClarification,
  ReturnRecapGapUpdate,
} from "@/lib/clarity/ai/return-recap-interpreter";

export type ReturnGapUpdateDraft = ReturnRecapGapUpdate & {
  decision: "kept" | "removed";
  source: "mock_ai" | "manual";
};

export type ReturnClarificationDraft = ReturnRecapClarification & {
  resolution:
    | {
        kind: "linked_action";
        actionId: string;
      }
    | {
        kind: "separate_history";
      }
    | {
        kind: "removed";
      }
    | null;
};

export function GapUpdateProposalReview({
  updates,
  onChange,
  onRemove,
}: {
  updates: ReturnGapUpdateDraft[];
  onChange: (update: ReturnGapUpdateDraft) => void;
  onRemove: (updateId: string) => void;
}) {
  const visibleUpdates = updates.filter(
    (update) => update.decision === "kept",
  );
  const groupedUpdates = groupGapUpdates(visibleUpdates);

  if (visibleUpdates.length === 0) {
    return (
      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-muted-foreground">
          While you were away
        </h2>
        <p className="text-sm text-muted-foreground">
          No extra updates are being kept.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        While you were away
      </h2>
      {[...groupedUpdates.entries()].map(([date, dateUpdates]) => (
        <div key={date} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {date === "unknown"
              ? "Date unclear"
              : `${formatWeekday(date)} · ${formatFullLocalDate(date)}`}
          </p>
          {dateUpdates.map((update) => (
            <GapUpdateCard
              key={update.id}
              update={update}
              onChange={onChange}
              onRemove={() => onRemove(update.id)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function GapUpdateCard({
  update,
  onChange,
  onRemove,
}: {
  update: ReturnGapUpdateDraft;
  onChange: (update: ReturnGapUpdateDraft) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(update.title);
  const [description, setDescription] = useState(update.description);
  const [approximateDate, setApproximateDate] = useState(
    update.approximateDate ?? "",
  );

  return (
    <article className="rounded-2xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="font-semibold">{update.title}</p>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {gapUpdateSummary(update)}
        </p>
      </div>

      {!editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            className="h-9 px-2 text-xs text-muted-foreground"
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="h-9 px-2 text-xs text-destructive hover:text-destructive"
          >
            Remove
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Title
            </span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              className="h-10 rounded-xl"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Detail
            </span>
            <Textarea
              value={description}
              onChange={(event) =>
                setDescription(event.currentTarget.value)
              }
              className="min-h-20 rounded-xl"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Approximate date
            </span>
            <Input
              type="date"
              value={approximateDate}
              onChange={(event) =>
                setApproximateDate(event.currentTarget.value)
              }
              className="h-10 rounded-xl"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTitle(update.title);
                setDescription(update.description);
                setApproximateDate(update.approximateDate ?? "");
                setEditing(false);
              }}
              className="h-10 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!title.trim() || !description.trim()}
              onClick={() => {
                onChange({
                  ...update,
                  title: title.trim(),
                  description: description.trim(),
                  approximateDate: approximateDate || null,
                });
                setEditing(false);
              }}
              className="h-10 rounded-xl"
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

export function ClarificationReview({
  clarifications,
  actions,
  onResolve,
}: {
  clarifications: ReturnClarificationDraft[];
  actions: Array<{ id: string; title: string }>;
  onResolve: (
    clarification: ReturnClarificationDraft,
    resolution: NonNullable<ReturnClarificationDraft["resolution"]>,
  ) => void;
}) {
  const pending = clarifications.filter(
    (clarification) => !clarification.resolution,
  );
  const [openId, setOpenId] = useState<string | null>(
    pending[0]?.id ?? null,
  );

  if (pending.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Needs clarification · {pending.length}
      </h2>
      {pending.map((clarification) => {
        const open = openId === clarification.id;
        const suggestedActions = actions.filter((action) =>
          clarification.suggestedActionIds.includes(action.id),
        );

        return (
          <article
            key={clarification.id}
            className="overflow-hidden rounded-2xl border border-border bg-card"
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() =>
                setOpenId((current) =>
                  current === clarification.id
                    ? null
                    : clarification.id,
                )
              }
              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block font-semibold">
                  Needs clarification
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {clarification.question}
                </span>
              </span>
              <ChevronDown
                className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>
            {open && (
              <div className="space-y-2 border-t border-border p-3">
                {suggestedActions.map((action) => (
                  <Button
                    key={action.id}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onResolve(clarification, {
                        kind: "linked_action",
                        actionId: action.id,
                      });
                      setOpenId(null);
                    }}
                    className="min-h-11 w-full justify-start whitespace-normal rounded-xl text-left"
                  >
                    Link to {action.title}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onResolve(clarification, {
                      kind: "separate_history",
                    });
                    setOpenId(null);
                  }}
                  className="h-11 w-full justify-start rounded-xl text-muted-foreground"
                >
                  Keep as separate historical activity
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onResolve(clarification, { kind: "removed" });
                    setOpenId(null);
                  }}
                  className="h-11 w-full justify-start rounded-xl text-destructive hover:text-destructive"
                >
                  Remove
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function gapUpdateSummary(update: ReturnGapUpdateDraft) {
  if (update.kind === "commitment_or_deadline" && update.dueDate) {
    return `${update.description} · Due ${formatWeekday(update.dueDate)}`;
  }

  if (
    update.kind === "change_or_blocker" &&
    update.stillAffectsToday === false
  ) {
    return `${update.description} · No ongoing update`;
  }

  if (update.outcome === "finished") {
    return `${update.description} · Finished`;
  }

  if (update.outcome === "made_progress") {
    return `${update.description} · Made progress`;
  }

  return update.description;
}

function groupGapUpdates(updates: ReturnGapUpdateDraft[]) {
  const groups = new Map<string, ReturnGapUpdateDraft[]>();

  for (const update of updates) {
    const key = update.approximateDate ?? "unknown";
    groups.set(key, [...(groups.get(key) ?? []), update]);
  }

  return groups;
}
