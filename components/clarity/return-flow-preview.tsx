"use client";

import { useState } from "react";

import { MockReturnRecapInterpreter } from "@/lib/clarity/ai/mock-return-recap-interpreter";
import type { ReturnRecapInterpretation } from "@/lib/clarity/ai/return-recap-interpreter";
import { NaturalRecapScreen } from "./natural-recap-screen";
import type { RecapActionDraft } from "./recap-action-panel";
import type { RecapCompletedItem } from "./recap-completed-item-form";
import {
  RecapContextReview,
  type RecapDayContext,
} from "./recap-context-review";
import {
  activitiesFromRecapInterpretation,
  applyRecapInterpretation,
  contextsFromRecapInterpretation,
} from "./recap-interpretation";
import { RecapScreen } from "./recap-screen";

type PreviewStep = "input" | "proposal" | "manual" | "ready";

const recapDate = "2026-07-28";
const currentDate = "2026-07-29";
const sampleRecap =
  "I picked up my sister and went to the gym. I didn’t work on my resume, and I got takeaway instead of cooking. I closed a client, but I also barely slept.";
const interpreter = new MockReturnRecapInterpreter();
const actions = [
  {
    id: "preview-pick-up",
    title: "Pick up my sister",
    completed: false,
  },
  {
    id: "preview-gym",
    title: "Go to the gym",
    completed: false,
  },
  {
    id: "preview-resume",
    title: "Work on my resume",
    completed: false,
  },
  {
    id: "preview-dinner",
    title: "Make dinner",
    completed: false,
  },
  {
    id: "preview-assignment",
    title: "Work on my assignment",
    completed: false,
  },
] as const;

export function ReturnFlowPreview() {
  const [step, setStep] = useState<PreviewStep>("input");
  const [naturalRecap, setNaturalRecap] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] =
    useState<ReturnRecapInterpretation | null>(null);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [activities, setActivities] = useState<
    RecapCompletedItem[]
  >([]);
  const [contexts, setContexts] = useState<RecapDayContext[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  function reset() {
    setStep("input");
    setNaturalRecap("");
    setInputError(null);
    setInterpreting(false);
    setInterpretation(null);
    setDrafts(initialDrafts());
    setActivities([]);
    setContexts([]);
    setConfirmed(false);
  }

  async function reviewNaturalRecap(
    value = naturalRecap || sampleRecap,
  ) {
    const normalized = value.trim();

    if (!normalized) {
      setInputError("Tell Clarity what happened before reviewing.");
      return;
    }

    setNaturalRecap(normalized);
    setInputError(null);
    setInterpreting(true);

    try {
      const result = await interpreter.interpretReturnRecap(
        normalized,
        actions.map((action) => ({
          id: action.id,
          title: action.title,
          existingOutcome: action.completed ? "finished" : null,
        })),
        {
          dates: [recapDate],
          currentDate,
        },
      );

      setInterpretation(result);
      setDrafts((current) =>
        applyRecapInterpretation(current, result),
      );
      setActivities(
        activitiesFromRecapInterpretation(result)
          .filter((activity) => activity.outcome === "finished")
          .map((activity) => ({
            id: activity.id,
            title: activity.title,
            completionTime:
              activity.timeUnknown || !activity.completionTime
                ? ""
                : activity.completionTime,
          })),
      );
      setContexts(contextsFromRecapInterpretation(result));
      setStep("proposal");
    } finally {
      setInterpreting(false);
    }
  }

  function updateDraft(
    actionId: string,
    update: Partial<RecapActionDraft>,
  ) {
    setDrafts((current) => ({
      ...current,
      [actionId]: {
        ...current[actionId],
        ...update,
      },
    }));
  }

  async function selectStep(nextStep: PreviewStep) {
    setConfirmed(false);

    if (
      (nextStep === "proposal" || nextStep === "ready") &&
      !interpretation
    ) {
      await reviewNaturalRecap(sampleRecap);
    }

    if (nextStep === "ready") {
      setDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, draft]) => [
            id,
            draft.outcome
              ? {
                  ...draft,
                  outcomeConfirmed: true,
                  notDoneNote:
                    draft.outcome === "not_done"
                      ? draft.notDoneNote || "Plans changed."
                      : draft.notDoneNote,
                }
              : {
                  ...draft,
                  outcome: "not_done" as const,
                  outcomeConfirmed: true,
                  notDoneNote: "Plans changed.",
                },
          ]),
        ),
      );
    }

    if (nextStep === "manual") {
      setDrafts(initialDrafts());
      setActivities([]);
      setContexts([]);
    }

    setStep(nextStep);
  }

  const payload = {
    naturalRecap,
    plannedActions: actions.map((action) => ({
      actionId: action.id,
      outcome: drafts[action.id]?.outcome ?? "needs_review",
      confirmed: drafts[action.id]?.outcomeConfirmed ?? false,
      supportingPhrase:
        drafts[action.id]?.supportingPhrase || null,
    })),
    unplannedActivities: activities,
    contextSummary: contexts.map((item) => item.text).join("\n"),
  };

  return (
    <main className="min-h-dvh bg-[#020914] px-3 py-4 text-foreground sm:px-6">
      <details className="mx-auto max-w-[900px] rounded-xl border border-[#28415f] bg-[#071426] text-[#c4d1df]">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
          Dev tools
        </summary>
        <div className="flex flex-wrap items-end justify-center gap-2 border-t border-[#28415f] px-3 py-2">
          <label className="space-y-1 text-[11px]">
            <span className="block text-[#91a3b7]">Screen</span>
            <select
              value={step}
              onChange={(event) =>
                selectStep(event.currentTarget.value as PreviewStep)
              }
              className="h-8 rounded-md border border-[#38516e] bg-[#0c1d32] px-2 text-xs text-[#e4ebf2] outline-none focus-visible:ring-2 focus-visible:ring-[#5598d8]"
            >
              <option value="input">Natural Recap</option>
              <option value="proposal">Here’s what I understood</option>
              <option value="manual">Manual fallback</option>
              <option value="ready">Confirmation ready</option>
            </select>
          </label>
          <DevControl onClick={reset}>Reset</DevControl>
          <details className="w-full border-t border-[#28415f] pt-2">
            <summary className="cursor-pointer text-center text-[11px] font-medium text-[#91a3b7]">
              Debug payload
            </summary>
            <pre className="mx-auto mt-2 max-h-48 max-w-2xl overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#030b16] p-3 text-[11px] leading-5 text-[#a9b8c8]">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
        </div>
      </details>

      <div className="mx-auto mt-5 w-full max-w-[900px]">
        <div className="mx-auto h-[780px] min-h-[780px] w-[390px] max-w-full overflow-hidden rounded-[2rem] border border-border bg-background shadow-2xl">
          {step === "input" ? (
            <NaturalRecapScreen
              contained
              developmentPreview
              recapDate={recapDate}
              actionTitles={actions.map((action) => action.title)}
              value={naturalRecap}
              error={inputError}
              pending={interpreting}
              onChange={(value) => {
                setNaturalRecap(value);
                setInputError(null);
              }}
              onReview={() => reviewNaturalRecap()}
              onManualReview={() => selectStep("manual")}
            />
          ) : (
            <RecapScreen
              key={step}
              contained
              developmentPreview
              experience={{
                recapDate,
                currentDate,
                actions: actions.map((action) => ({
                  id: action.id,
                  title: action.title,
                  initiallyConfirmed: action.completed,
                })),
                drafts,
                activities,
                onDraftChange: updateDraft,
                onAddActivity: (activity) =>
                  setActivities((current) => [
                    ...current,
                    activity,
                  ]),
                onUpdateActivity: (activity) =>
                  setActivities((current) =>
                    current.map((entry) =>
                      entry.id === activity.id ? activity : entry,
                    ),
                  ),
                onDeleteActivity: (activityId) =>
                  setActivities((current) =>
                    current.filter(
                      (activity) => activity.id !== activityId,
                    ),
                  ),
                heading:
                  step === "manual"
                    ? "Recap Tuesday"
                    : "Here’s what I understood",
                supportingCopy:
                  step === "manual"
                    ? undefined
                    : "Check anything that doesn’t look right.",
                afterActionSections:
                  step === "manual" ? null : (
                    <RecapContextReview
                      items={contexts}
                      onChange={(changedItem) =>
                        setContexts((current) =>
                          current.map((item) =>
                            item.id === changedItem.id
                              ? changedItem
                              : item,
                          ),
                        )
                      }
                      onRemove={(itemId) =>
                        setContexts((current) =>
                          current.filter(
                            (item) => item.id !== itemId,
                          ),
                        )
                      }
                    />
                  ),
                continueType: "button",
                continueLabel: "Confirm Tuesday",
                onContinue: () => setConfirmed(true),
              }}
            />
          )}
          {confirmed && (
            <p className="sr-only" role="status">
              Tuesday confirmed in this local preview.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function initialDrafts(): Record<string, RecapActionDraft> {
  return Object.fromEntries(
    actions.map((action) => [
      action.id,
      {
        outcome: action.completed ? "finished" : undefined,
        outcomeConfirmed: action.completed,
        completionTime: "",
        timeUnknown: true,
        completionCorrected: false,
        progressNote: "",
        notDoneNote: "",
        closeReason: "",
        closeContext: "",
        resolvedElsewhereNote: "",
        supportingPhrase: "",
      },
    ]),
  );
}

function DevControl({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-md border border-[#38516e] bg-[#0c1d32] px-2.5 text-xs text-[#d5e0eb] hover:bg-[#132941] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5598d8]"
    >
      {children}
    </button>
  );
}
