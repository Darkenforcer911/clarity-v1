"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { progressExplanationError } from "@/lib/clarity/recap-validation";
import { TimeSelector } from "./time-selector";

export type RecapOutcome =
  | "finished"
  | "made_progress"
  | "not_done"
  | "closed"
  | "resolved_elsewhere";

export type RecapCloseReason = "removed_from_plan";

export type RecapActionDraft = {
  outcome?: RecapOutcome;
  outcomeConfirmed: boolean;
  completionTime: string;
  timeUnknown: boolean;
  completionCorrected: boolean;
  progressNote: string;
  notDoneNote: string;
  closeReason: RecapCloseReason | "";
  closeContext: string;
  resolvedElsewhereNote: string;
  supportingPhrase: string;
};

export function RecapActionPanel({
  title,
  draft,
  open,
  onToggle,
  onDraftChange,
  onResolve,
  subdued = false,
}: {
  title: string;
  draft: RecapActionDraft;
  open: boolean;
  onToggle: () => void;
  onDraftChange: (update: Partial<RecapActionDraft>) => void;
  onResolve: (update: Partial<RecapActionDraft>) => void;
  subdued?: boolean;
}) {
  const [activeOutcome, setActiveOutcome] =
    useState<RecapOutcome | null>(() =>
      visualOutcome(draft.outcome),
    );
  const [notDoneNoteDraft, setNotDoneNoteDraft] = useState(
    draft.notDoneNote,
  );
  const [notDoneEditorOpen, setNotDoneEditorOpen] = useState(false);
  const [closeEditorOpen, setCloseEditorOpen] = useState(false);
  const [closeContextDraft, setCloseContextDraft] = useState(
    draft.closeContext,
  );
  const [explanationError, setExplanationError] = useState<
    string | null
  >(null);
  const compactNotDone =
    !open &&
    draft.outcomeConfirmed &&
    draft.outcome === "not_done" &&
    Boolean(draft.notDoneNote.trim());
  const compactProgress =
    !open &&
    draft.outcomeConfirmed &&
    draft.outcome === "made_progress" &&
    Boolean(draft.progressNote.trim());
  const compactRemoved =
    !open &&
    draft.outcomeConfirmed &&
    draft.outcome === "closed";
  const compactExplanation = compactProgress
    ? draft.progressNote
    : compactNotDone
      ? draft.notDoneNote
      : compactRemoved
        ? draft.closeContext
        : "";

  function chooseOutcome(outcome: RecapOutcome) {
    setActiveOutcome(outcome);
    setNotDoneEditorOpen(false);
    setCloseEditorOpen(false);
    setExplanationError(null);

    if (outcome === "not_done") {
      setNotDoneEditorOpen(true);
      return;
    }

    if (outcome === "made_progress") {
      return;
    }

    if (outcome === "closed") {
      setCloseEditorOpen(true);
      return;
    }

    onResolve({
      outcome,
      ...(outcome === "finished"
        ? { timeUnknown: !draft.completionTime }
        : {}),
    });
  }

  function cancelOutcomeEdit() {
    setNotDoneNoteDraft(draft.notDoneNote);
    setNotDoneEditorOpen(false);
    setCloseContextDraft(draft.closeContext);
    setCloseEditorOpen(false);
    setExplanationError(null);
    setActiveOutcome(
      draft.outcomeConfirmed ? visualOutcome(draft.outcome) : null,
    );
    onToggle();
  }

  return (
    <article
      data-slot="recap-activity-card"
      className={`overflow-hidden rounded-2xl border bg-card transition-colors motion-reduce:transition-none ${
        subdued && !open ? "border-border/70" : "border-border"
      }`}
    >
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            onToggle();
          }}
          className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="min-w-0">
            <span className="block font-semibold">{title}</span>
            <span
              className={`mt-0.5 flex items-center gap-1 text-sm ${
                draft.outcomeConfirmed
                  ? "text-[var(--clarity-completed)]"
                  : "text-muted-foreground"
              }`}
            >
              {draft.outcome === "finished" &&
                draft.outcomeConfirmed && (
                  <Check
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                  />
              )}
              {recapResolutionLabel(draft)}
            </span>
            {compactExplanation && (
              <span className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-5 text-muted-foreground">
                {compactExplanation}
              </span>
            )}
          </span>
          <ChevronDown
            className={`size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        {(compactProgress || compactNotDone || compactRemoved) && (
          <button
            type="button"
            onClick={() => {
              if (compactRemoved) {
                setActiveOutcome("closed");
                setCloseContextDraft(draft.closeContext);
                setCloseEditorOpen(true);
              } else if (compactNotDone) {
                setActiveOutcome("not_done");
                setNotDoneNoteDraft(draft.notDoneNote);
                setNotDoneEditorOpen(true);
                setCloseEditorOpen(false);
              } else {
                setActiveOutcome("made_progress");
                setNotDoneEditorOpen(false);
                setCloseEditorOpen(false);
              }
              onToggle();
            }}
            className="mr-2 min-h-11 shrink-0 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Edit
          </button>
        )}
      </div>

      <div
        aria-hidden={!open}
        inert={open ? undefined : true}
        className={`grid transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none ${
          open
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-border px-3 py-3">
            <fieldset className="grid grid-cols-3 gap-1.5">
              <legend className="sr-only">
                What happened with {title}?
              </legend>
              <OutcomeChoice
                selected={activeOutcome === "finished"}
                onClick={() => chooseOutcome("finished")}
              >
                Done
              </OutcomeChoice>
              <OutcomeChoice
                selected={activeOutcome === "made_progress"}
                onClick={() => chooseOutcome("made_progress")}
              >
                Some progress
              </OutcomeChoice>
              <OutcomeChoice
                selected={activeOutcome === "not_done"}
                onClick={() => chooseOutcome("not_done")}
              >
                Didn&apos;t happen
              </OutcomeChoice>
            </fieldset>

            <Button
              type="button"
              variant="ghost"
              aria-pressed={activeOutcome === "closed"}
              onClick={() => chooseOutcome("closed")}
              className={`h-10 rounded-xl border px-2 text-sm ${
                activeOutcome === "closed"
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              No longer needed
            </Button>

            {activeOutcome === "closed" && closeEditorOpen && (
              <div className="space-y-3 rounded-xl bg-secondary/45 p-3">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold">
                    Why is this no longer needed?
                  </span>
                  <Textarea
                    value={closeContextDraft}
                    maxLength={500}
                    placeholder="It was cancelled, handled another way, the requirement changed..."
                    onChange={(event) =>
                      setCloseContextDraft(event.currentTarget.value)
                    }
                    className="min-h-20 rounded-xl"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelOutcomeEdit}
                    className="h-11 rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={!closeContextDraft.trim()}
                    onClick={() => {
                      const explanation = closeContextDraft.trim();

                      if (!explanation) {
                        return;
                      }

                      setCloseEditorOpen(false);
                      onResolve({
                        outcome: "closed",
                        closeReason: "removed_from_plan",
                        closeContext: explanation,
                      });
                    }}
                    className="h-11 rounded-xl"
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            )}

            {!closeEditorOpen &&
              !notDoneEditorOpen &&
              activeOutcome === "made_progress" && (
                <label className="block space-y-2">
                  <span className="text-sm font-semibold">
                    What moved forward?
                  </span>
                  <Textarea
                    value={draft.progressNote}
                    maxLength={500}
                    placeholder="Added my work history and rewrote the summary."
                    onChange={(event) => {
                      onDraftChange({
                        progressNote: event.currentTarget.value,
                      });
                      setExplanationError(null);
                    }}
                    className="min-h-20 rounded-xl"
                  />
                </label>
              )}

            {!closeEditorOpen &&
              !notDoneEditorOpen &&
              activeOutcome === "finished" && (
                <TimeSelector
                  name="recapCompletionTime"
                  label="When"
                  summary={
                    draft.completionTime && !draft.timeUnknown
                      ? formatLocalTimeLabel(draft.completionTime)
                      : "Anytime"
                  }
                  value={draft.timeUnknown ? "" : draft.completionTime}
                  onChange={(completionTime) => {
                    onDraftChange({
                      completionTime,
                      timeUnknown: !completionTime,
                      completionCorrected: true,
                    });
                  }}
                  onRemove={() => {
                    onDraftChange({
                      completionTime: "",
                      timeUnknown: true,
                      completionCorrected: true,
                    });
                  }}
                />
              )}

            {activeOutcome === "not_done" &&
            !closeEditorOpen &&
            notDoneEditorOpen ? (
              <div className="space-y-3">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold">
                    What happened?
                  </span>
                  <Textarea
                    value={notDoneNoteDraft}
                    maxLength={500}
                    placeholder="I ran out of time, plans changed, I was blocked, I forgot, or I chose not to do it..."
                    onChange={(event) =>
                      setNotDoneNoteDraft(
                        event.currentTarget.value,
                      )
                    }
                    className="min-h-20 rounded-xl"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelOutcomeEdit}
                    className="h-11 rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={!notDoneNoteDraft.trim()}
                    onClick={() => {
                      if (!notDoneNoteDraft.trim()) {
                        return;
                      }

                      setNotDoneEditorOpen(false);
                      onResolve({
                        outcome: "not_done",
                        notDoneNote: notDoneNoteDraft,
                      });
                    }}
                    className="h-11 rounded-xl"
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            ) : (
              !closeEditorOpen &&
              activeOutcome === "not_done" && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setNotDoneNoteDraft(draft.notDoneNote);
                    setNotDoneEditorOpen(true);
                  }}
                  className="h-10 rounded-xl px-2 text-sm text-muted-foreground"
                >
                  Edit
                </Button>
              )
            )}

            {explanationError && (
              <p role="alert" className="text-sm text-destructive">
                {explanationError}
              </p>
            )}

            {!closeEditorOpen &&
              !notDoneEditorOpen &&
              activeOutcome === "made_progress" && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const error = progressExplanationError(
                    draft.progressNote,
                  );

                  if (error) {
                    setExplanationError(error);
                    return;
                  }

                  onResolve({
                    outcome: "made_progress",
                    progressNote: draft.progressNote.trim(),
                  });
                }}
                className="h-10 rounded-xl"
              >
                Save progress
              </Button>
            )}

          </div>
        </div>
      </div>
    </article>
  );
}

function OutcomeChoice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center justify-center rounded-lg border px-2 text-center text-xs font-semibold ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function recapResolutionLabel(draft: RecapActionDraft) {
  if (!draft.outcomeConfirmed) {
    return "Needs review";
  }

  if (draft.outcome === "finished") {
    return draft.completionTime && !draft.timeUnknown
      ? `Done · ${formatLocalTimeLabel(draft.completionTime)}`
      : "Done · Anytime";
  }

  if (draft.outcome === "made_progress") {
    return "Some progress";
  }

  if (draft.outcome === "not_done") {
    return "Didn’t happen";
  }

  if (draft.outcome === "closed") {
    return "No longer needed";
  }

  if (draft.outcome === "resolved_elsewhere") {
    return draft.resolvedElsewhereNote.trim()
      ? `Didn’t happen · ${shortText(draft.resolvedElsewhereNote)}`
      : "Didn’t happen";
  }

  return "Needs review";
}

function visualOutcome(
  outcome: RecapOutcome | undefined,
): RecapOutcome | null {
  return outcome === "resolved_elsewhere"
    ? "not_done"
    : outcome ?? null;
}

function shortText(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 64
    ? `${normalized.slice(0, 61).trimEnd()}…`
    : normalized;
}

function formatLocalTimeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const meridiem = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}
