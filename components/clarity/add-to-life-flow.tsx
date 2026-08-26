"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";

import { createMentorLifeProposalAction } from "@/app/(app)/life-model/proposal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  initialLifeModelProposalActionState,
} from "@/lib/clarity/life-model-proposal-action-state";
import {
  interpretLifeIntent,
  kindLabel,
  type LifeProposalAreaOption,
  type LifeProposalDraft,
  type LifeProposalKind,
} from "@/lib/clarity/life-model-proposal";
import { PendingButton } from "./pending-button";

const fieldClassName = "h-12 rounded-xl";
const selectClassName =
  "h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

export function AddToLifeFlow({
  areas,
  initialIntent = "",
}: {
  areas: LifeProposalAreaOption[];
  initialIntent?: string;
}) {
  const [intent, setIntent] = useState(initialIntent);
  const [draft, setDraft] = useState<LifeProposalDraft | null>(
    initialIntent.trim() ? interpretLifeIntent(initialIntent, areas) : null,
  );
  const [editing, setEditing] = useState(Boolean(initialIntent.trim()));
  const [areaChoice, setAreaChoice] = useState(
    draft?.areaId ?? "new",
  );
  const [kind, setKind] = useState<LifeProposalKind>(draft?.kind ?? "goal");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [areaName, setAreaName] = useState(draft?.areaName ?? "Personal Growth");
  const [desiredState, setDesiredState] = useState("");
  const [prioritise, setPrioritise] = useState(false);
  const [routineCadence, setRoutineCadence] = useState<"daily" | "weekly">("weekly");
  const [routineEstimatedMinutes, setRoutineEstimatedMinutes] = useState("30");
  const [state, action] = useActionState(
    createMentorLifeProposalAction,
    initialLifeModelProposalActionState,
  );

  function reviewIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!intent.trim()) return;
    const next = interpretLifeIntent(intent, areas);
    setDraft(next);
    setAreaChoice(next.areaId ?? "new");
    setAreaName(next.areaName);
    setKind(next.kind);
    setTitle(next.title);
    setDescription(next.description);
    setEditing(false);
  }

  if (!draft) {
    return (
      <div className="space-y-6">
        <Link
          href="/life-model"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Life
        </Link>
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            Life change
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">
            What would you like to add or change?
          </h1>
          <p className="text-sm text-muted-foreground">
            Talk through new goals, changes, or things you no longer want Clarity to track. You’ll review any updates before they change your Life.
          </p>
        </header>
        <form onSubmit={reviewIntent} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">What is changing?</span>
            <Textarea
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="I want to learn piano."
              className="min-h-32 rounded-xl"
              autoFocus
              required
            />
          </label>
          <Button type="submit" className="h-12 w-full rounded-xl" disabled={!intent.trim()}>
            <Sparkles /> Review proposal
          </Button>
        </form>
      </div>
    );
  }

  const selectedArea = areas.find((area) => area.id === areaChoice);
  const shownAreaName = selectedArea?.name ?? areaName;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setDraft(null)}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Proposed interpretation
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">
          Does this reflect what you mean?
        </h1>
        <p className="text-sm text-muted-foreground">
          This is still a proposal. Life will not change until you confirm it.
        </p>
      </header>

      <form action={action} className="space-y-5">
        <input type="hidden" name="intent" value={intent} />
        {!editing ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <ProposalFact label="Life Area" value={shownAreaName} />
            <ProposalFact label={kindLabel(kind)} value={title} />
            {kind !== "routine" && (
              <ProposalFact
                label={kind === "open_question" ? "Context" : "Meaning"}
                value={description}
              />
            )}
            {desiredState && <ProposalFact label="Desired State" value={desiredState} />}
            <ProposalFact
              label="Current Direction impact"
              value={prioritise ? "Include in current priorities" : "None — not prioritised yet"}
            />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-11 text-sm font-semibold text-primary"
            >
              Edit proposal
            </button>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Interpret as</span>
              <select
                name="kindEditor"
                value={kind}
                onChange={(event) => {
                  const nextKind = event.target.value as LifeProposalKind;
                  setKind(nextKind);
                  if (nextKind !== "goal") setPrioritise(false);
                }}
                className={selectClassName}
              >
                <option value="goal">Goal</option>
                <option value="project">Project</option>
                <option value="routine">Routine</option>
                <option value="current_context">Current Context</option>
                <option value="desired_state">Desired State</option>
                <option value="open_question">Open Question</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Life Area</span>
              <select
                value={areaChoice}
                onChange={(event) => {
                  setAreaChoice(event.target.value);
                  const area = areas.find((candidate) => candidate.id === event.target.value);
                  if (area) setAreaName(area.name);
                }}
                className={selectClassName}
              >
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
                <option value="new">A new Life Area</option>
              </select>
            </label>
            {areaChoice === "new" && (
              <label className="block space-y-2">
                <span className="text-sm font-medium">New Life Area</span>
                <Input value={areaName} onChange={(event) => setAreaName(event.target.value)} className={fieldClassName} required />
              </label>
            )}
            <label className="block space-y-2">
              <span className="text-sm font-medium">{kindLabel(kind)}</span>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClassName} required />
            </label>
            {kind !== "routine" && (
              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  {kind === "open_question" ? "Context" : "What this means"}
                </span>
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 rounded-xl" required />
              </label>
            )}
            {kind === "routine" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Repeats</span>
                  <select
                    value={routineCadence}
                    onChange={(event) => setRoutineCadence(event.target.value as "daily" | "weekly")}
                    className={selectClassName}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Minutes</span>
                  <Input
                    type="number"
                    min="1"
                    max="1440"
                    value={routineEstimatedMinutes}
                    onChange={(event) => setRoutineEstimatedMinutes(event.target.value)}
                    className={fieldClassName}
                  />
                </label>
              </div>
            )}
            {(kind === "goal" || kind === "project") && (
              <label className="block space-y-2">
                <span className="text-sm font-medium">Desired State (optional)</span>
                <Textarea value={desiredState} onChange={(event) => setDesiredState(event.target.value)} className="min-h-20 rounded-xl" />
              </label>
            )}
            {kind === "goal" && (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={prioritise}
                  onChange={(event) => setPrioritise(event.target.checked)}
                  className="size-5 accent-primary"
                />
                Include this Goal in Current Direction
              </label>
            )}
            <Button type="button" variant="secondary" className="h-11 w-full rounded-xl" onClick={() => setEditing(false)}>
              Done
            </Button>
          </div>
        )}

        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="existingAreaId" value={areaChoice === "new" ? "" : areaChoice} />
        <input type="hidden" name="areaName" value={shownAreaName} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="desiredState" value={desiredState} />
        <input type="hidden" name="routineCadence" value={routineCadence} />
        <input type="hidden" name="routineEstimatedMinutes" value={routineEstimatedMinutes} />
        <input type="hidden" name="includeInCurrentDirection" value={String(prioritise)} />
        <input
          type="hidden"
          name="directionSummary"
          value={prioritise ? `Make ${title} part of my current direction` : ""}
        />
        <input
          type="hidden"
          name="directionRationale"
          value={prioritise ? "I explicitly chose to prioritise this Goal." : ""}
        />

        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">{state.message}</p>
        )}
        <PendingButton pendingLabel="Creating proposal…" className="h-12 w-full rounded-xl">
          Continue to confirmation
        </PendingButton>
      </form>
    </div>
  );
}

function ProposalFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
