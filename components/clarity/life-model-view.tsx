"use client";

import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CirclePause,
  CirclePlay,
  FileCheck2,
  Flag,
  Pencil,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { mutateLifeModelAction } from "@/app/(app)/life-model/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  initialLifeModelActionState,
} from "@/lib/clarity/life-model-action-state";
import type { LifeModel } from "@/lib/clarity/life-model";
import { ClarityFormHeader } from "./clarity-form-header";
import { PendingButton } from "./pending-button";

type Area = LifeModel["areas"][number];
type Goal = Area["goals"][number];
type Project = Area["projects"][number];
type Routine = Area["routines"][number];
type CurrentContext = Area["currentContexts"][number];
type Evidence = Area["evidence"][number];

const fieldClassName = "h-12 rounded-xl";
const selectClassName =
  "h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

export function LifeModelView({ model }: { model: LifeModel }) {
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState<string | null>(null);

  if (model.areas.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Your life</h1>
        <p className="text-sm text-muted-foreground">
          What Clarity currently knows about you.
        </p>
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Clarity will build this with you as it learns about your life.
        </div>
      </div>
    );
  }

  function openEditor(key: string) {
    setEditorKey(key);
  }

  return (
    <div className="space-y-5" data-slot="life-model-view">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Your life</h1>
        <p className="text-sm text-muted-foreground">
          What Clarity currently knows about you.
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="life-areas-heading">
        <h2
          id="life-areas-heading"
          className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Life Areas
        </h2>
        {model.areas.map((area, areaIndex) => {
          const expanded = expandedAreaId === area.id;
          return (
            <article
              key={area.id}
              data-life-area-id={area.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => {
                  setEditorKey(null);
                  setExpandedAreaId((current) => current === area.id ? null : area.id);
                }}
                className="flex min-h-20 w-full items-center gap-3 px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{area.name}</span>
                  {area.currentState && (
                    <span className="mt-1 block truncate text-sm text-muted-foreground">
                      {area.currentState.summary}
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatAreaCounts(area)}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
                />
              </button>

              {expanded && (
                <div className="space-y-5 border-t border-border px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditor(`area:${area.id}`)}
                    >
                      <Pencil /> Edit area
                    </Button>
                    {!area.currentState && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditor(`state:${area.id}`)}
                      >
                        <FileCheck2 /> Add current state
                      </Button>
                    )}
                    <AreaOrderButton
                      areaIds={model.areas.map((candidate) => candidate.id)}
                      areaIndex={areaIndex}
                      direction="up"
                    />
                    <AreaOrderButton
                      areaIds={model.areas.map((candidate) => candidate.id)}
                      areaIndex={areaIndex}
                      direction="down"
                    />
                  </div>

                  {editorKey === `area:${area.id}` && (
                    <AreaEditor area={area} onClose={() => setEditorKey(null)} />
                  )}
                  {editorKey === `state:${area.id}` && (
                    <CurrentStateEditor area={area} onClose={() => setEditorKey(null)} />
                  )}

                  {area.currentState && (
                    <LifeSection title="Current state">
                      <LifeFactRow
                        title={area.currentState.summary}
                        detail={`As of ${formatDate(area.currentState.as_of_date)}`}
                        onEdit={() => openEditor(`state:${area.id}`)}
                      />
                      {editorKey === `state:${area.id}` && (
                        <CurrentStateEditor area={area} onClose={() => setEditorKey(null)} />
                      )}
                    </LifeSection>
                  )}

                  {area.goals.length > 0 && (
                    <LifeSection title="Goals">
                      {area.goals.map((goal) => (
                        <div key={goal.id} className="space-y-3">
                          <LifeFactRow
                            title={goal.title}
                            detail={`${sentenceCase(goal.status)} · ${goal.desired_outcome}`}
                            onEdit={() => openEditor(`goal:${goal.id}`)}
                          />
                          {editorKey === `goal:${goal.id}` && (
                            <GoalEditor goal={goal} onClose={() => setEditorKey(null)} />
                          )}
                        </div>
                      ))}
                    </LifeSection>
                  )}

                  {area.projects.length > 0 && (
                    <LifeSection title="Projects">
                      {area.projects.map((project) => (
                        <div key={project.id} className="space-y-3">
                          <LifeFactRow
                            title={project.title}
                            detail={`${sentenceCase(project.status)} · ${project.desired_outcome}`}
                            onEdit={() => openEditor(`project:${project.id}`)}
                          />
                          {editorKey === `project:${project.id}` && (
                            <ProjectEditor
                              area={area}
                              project={project}
                              onClose={() => setEditorKey(null)}
                            />
                          )}
                        </div>
                      ))}
                    </LifeSection>
                  )}

                  {area.routines.length > 0 && (
                    <LifeSection title="Routines">
                      {area.routines.map((routine) => (
                        <div key={routine.id} className="space-y-3">
                          <LifeFactRow
                            title={routine.title}
                            detail={`${sentenceCase(routine.status)} · ${formatRoutineCadence(routine)}`}
                            onEdit={() => openEditor(`routine:${routine.id}`)}
                          />
                          {editorKey === `routine:${routine.id}` && (
                            <RoutineEditor
                              area={area}
                              routine={routine}
                              onClose={() => setEditorKey(null)}
                            />
                          )}
                        </div>
                      ))}
                    </LifeSection>
                  )}

                  {area.currentContexts.length > 0 && (
                    <LifeSection title="Current context">
                      {area.currentContexts.map((context) => (
                        <div key={context.id} className="space-y-3">
                          <LifeFactRow
                            title={context.title}
                            detail={context.planning_impact}
                            onEdit={() => openEditor(`context:${context.id}`)}
                          />
                          {editorKey === `context:${context.id}` && (
                            <ContextEditor
                              context={context}
                              onClose={() => setEditorKey(null)}
                            />
                          )}
                        </div>
                      ))}
                    </LifeSection>
                  )}

                  {area.evidence.length > 0 && (
                    <LifeSection title="Evidence">
                      {area.evidence.map((evidence) => (
                        <div key={evidence.id} className="space-y-3">
                          <LifeFactRow
                            title={evidence.summary}
                            detail={`${sentenceCase(evidence.signal)} · ${formatDate(evidence.occurred_on)}`}
                            onEdit={() => openEditor(`evidence:${evidence.id}`)}
                          />
                          {editorKey === `evidence:${evidence.id}` && (
                            <EvidenceEditor
                              evidence={evidence}
                              onClose={() => setEditorKey(null)}
                            />
                          )}
                        </div>
                      ))}
                    </LifeSection>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function LifeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2" data-life-section={title}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function LifeFactRow({
  title,
  detail,
  onEdit,
}: {
  title: string;
  detail?: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex min-h-14 items-start gap-3 rounded-xl border border-border bg-secondary px-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block whitespace-pre-wrap text-sm font-medium">{title}</span>
        {detail && (
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onEdit}
        aria-label={`Edit ${title}`}
        className="size-11 min-h-11 min-w-11 shrink-0 rounded-xl"
      >
        <Pencil />
      </Button>
    </div>
  );
}

function MutationForm({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [state, action] = useActionState(
    mutateLifeModelAction,
    initialLifeModelActionState,
  );

  useEffect(() => {
    if (state.saved) {
      onClose();
      router.refresh();
    }
  }, [onClose, router, state.saved, state.version]);

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <ClarityFormHeader
        title={title}
        subtitle={subtitle}
        closeLabel={`Close ${title}`}
        onClose={onClose}
      />
      {children}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

function AreaEditor({ area, onClose }: { area: Area; onClose: () => void }) {
  return (
    <MutationForm title="Edit Life Area" onClose={onClose}>
      <input type="hidden" name="lifeAreaId" value={area.id} />
      <Field label="Name">
        <Input name="name" defaultValue={area.name} required maxLength={100} className={fieldClassName} />
      </Field>
      <div className="grid gap-2">
        <PendingButton name="operation" value="renameLifeArea" className="h-12 rounded-xl">
          Save changes
        </PendingButton>
        <PendingButton
          name="operation"
          value="archiveLifeArea"
          variant="ghost"
          className="h-11 rounded-xl text-destructive"
        >
          <Archive /> Archive Life Area
        </PendingButton>
      </div>
    </MutationForm>
  );
}

function CurrentStateEditor({ area, onClose }: { area: Area; onClose: () => void }) {
  return (
    <MutationForm title="Current state" subtitle="Confirmed facts about this area now." onClose={onClose}>
      <input type="hidden" name="operation" value="setCurrentState" />
      <input type="hidden" name="lifeAreaId" value={area.id} />
      <Field label="Summary">
        <Textarea name="summary" defaultValue={area.currentState?.summary ?? ""} required maxLength={5000} />
      </Field>
      <Field label="As of">
        <Input name="asOfDate" type="date" defaultValue={area.currentState?.as_of_date ?? ""} required className={fieldClassName} />
      </Field>
      <SaveButton />
    </MutationForm>
  );
}

function GoalEditor({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  return (
    <MutationForm title="Edit goal" onClose={onClose}>
      <input type="hidden" name="goalId" value={goal.id} />
      <Field label="Goal">
        <Input name="title" defaultValue={goal.title} required maxLength={200} className={fieldClassName} />
      </Field>
      <Field label="Desired outcome">
        <Textarea name="desiredOutcome" defaultValue={goal.desired_outcome} required maxLength={2000} />
      </Field>
      <TargetFields item={goal} />
      <PendingButton name="operation" value="updateGoal" className="h-12 w-full rounded-xl">
        Save changes
      </PendingButton>
      <div className="space-y-3 border-t border-border pt-4">
        <Field label="Decision note">
          <Textarea name="rationale" placeholder={goal.status === "exploring" ? "Optional unless abandoning" : "Required when abandoning"} maxLength={5000} />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          {goal.status === "exploring" && (
            <TransitionButton operation="transitionGoal" status="active">
              <CirclePlay /> Commit to goal
            </TransitionButton>
          )}
          <TransitionButton operation="transitionGoal" status="achieved">
            <Flag /> Mark achieved
          </TransitionButton>
          <TransitionButton operation="transitionGoal" status="abandoned" destructive>
            <Archive /> Abandon goal
          </TransitionButton>
        </div>
      </div>
    </MutationForm>
  );
}

function ProjectEditor({
  area,
  project,
  onClose,
}: {
  area: Area;
  project: Project;
  onClose: () => void;
}) {
  return (
    <MutationForm title="Edit project" onClose={onClose}>
      <input type="hidden" name="projectId" value={project.id} />
      <Field label="Project">
        <Input name="title" defaultValue={project.title} required maxLength={200} className={fieldClassName} />
      </Field>
      <Field label="Desired outcome">
        <Textarea name="desiredOutcome" defaultValue={project.desired_outcome} required maxLength={2000} />
      </Field>
      <Field label="Goal">
        <select name="goalId" defaultValue={project.goal_id ?? ""} className={selectClassName}>
          <option value="">No linked goal</option>
          {area.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
        </select>
      </Field>
      <Field label="Parent project">
        <select name="parentProjectId" defaultValue={project.parent_project_id ?? ""} className={selectClassName}>
          <option value="">No parent project</option>
          {area.projects.filter((candidate) => candidate.id !== project.id).map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
          ))}
        </select>
      </Field>
      <TargetFields item={project} />
      <PendingButton name="operation" value="updateProject" className="h-12 w-full rounded-xl">
        Save changes
      </PendingButton>
      {project.status !== "planned" && (
        <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
          {project.status === "active" ? (
            <TransitionButton operation="transitionProject" status="paused">
              <CirclePause /> Pause
            </TransitionButton>
          ) : (
            <TransitionButton operation="transitionProject" status="active">
              <CirclePlay /> Resume
            </TransitionButton>
          )}
          <TransitionButton operation="transitionProject" status="completed">
            <Flag /> Complete
          </TransitionButton>
          <TransitionButton operation="transitionProject" status="cancelled" destructive>
            <Archive /> Cancel project
          </TransitionButton>
        </div>
      )}
    </MutationForm>
  );
}

function RoutineEditor({
  area,
  routine,
  onClose,
}: {
  area: Area;
  routine: Routine;
  onClose: () => void;
}) {
  const [cadence, setCadence] = useState(routine.cadence);
  return (
    <MutationForm title="Edit routine" onClose={onClose}>
      <input type="hidden" name="routineId" value={routine.id} />
      <Field label="Routine">
        <Input name="title" defaultValue={routine.title} required maxLength={200} className={fieldClassName} />
      </Field>
      <Field label="Repeats">
        <select name="cadence" value={cadence} onChange={(event) => setCadence(event.target.value as Routine["cadence"])} className={selectClassName}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="times_per_week">Times per week</option>
          <option value="certain_days">Certain days</option>
        </select>
      </Field>
      {cadence === "times_per_week" && (
        <Field label="Times per week">
          <Input name="cadenceCount" type="number" min={1} max={7} defaultValue={routine.cadence_count ?? 1} className={fieldClassName} />
        </Field>
      )}
      {cadence === "certain_days" && <WeekdayFields selected={routine.weekdays} />}
      <Field label="Estimated minutes">
        <Input name="estimatedMinutes" type="number" min={1} max={1440} defaultValue={routine.estimated_minutes} required className={fieldClassName} />
      </Field>
      <Field label="Preferred time">
        <Input name="preferredTime" type="time" defaultValue={routine.preferred_time?.slice(0, 5) ?? ""} className={fieldClassName} />
      </Field>
      <Field label="Goal">
        <select name="goalId" defaultValue={routine.goal_id ?? ""} className={selectClassName}>
          <option value="">No linked goal</option>
          {area.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
        </select>
      </Field>
      <Field label="Project">
        <select name="projectId" defaultValue={routine.project_id ?? ""} className={selectClassName}>
          <option value="">No linked project</option>
          {area.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
      </Field>
      <Field label="If skipped">
        <select name="skipPolicy" defaultValue={routine.skip_policy} className={selectClassName}>
          <option value="skip">Skip it</option>
          <option value="offer_makeup">Offer a make-up</option>
        </select>
      </Field>
      <PendingButton name="operation" value="updateRoutine" className="h-12 w-full rounded-xl">
        Save changes
      </PendingButton>
      <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
        {routine.status === "active" ? (
          <TransitionButton operation="transitionRoutine" status="paused">
            <CirclePause /> Pause
          </TransitionButton>
        ) : (
          <TransitionButton operation="transitionRoutine" status="active">
            <CirclePlay /> Resume
          </TransitionButton>
        )}
        <TransitionButton operation="transitionRoutine" status="ended" destructive>
          <Archive /> End routine
        </TransitionButton>
      </div>
    </MutationForm>
  );
}

function ContextEditor({ context, onClose }: { context: CurrentContext; onClose: () => void }) {
  return (
    <MutationForm title="Edit current context" onClose={onClose}>
      <input type="hidden" name="contextId" value={context.id} />
      <Field label="Context">
        <Input name="title" defaultValue={context.title} required maxLength={200} className={fieldClassName} />
      </Field>
      <Field label="Planning impact">
        <Textarea name="planningImpact" defaultValue={context.planning_impact} required maxLength={5000} />
      </Field>
      <Field label="Started on">
        <Input name="startedOn" type="date" defaultValue={context.started_on} required className={fieldClassName} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Earliest expected end">
          <Input name="expectedEndStart" type="date" defaultValue={context.expected_end_start ?? ""} className={fieldClassName} />
        </Field>
        <Field label="Latest expected end">
          <Input name="expectedEndEnd" type="date" defaultValue={context.expected_end_end ?? ""} className={fieldClassName} />
        </Field>
      </div>
      <PendingButton name="operation" value="updateContext" className="h-12 w-full rounded-xl">
        Save changes
      </PendingButton>
      <PendingButton name="operation" value="endContext" variant="ghost" className="h-11 w-full rounded-xl text-destructive">
        <Archive /> End context
      </PendingButton>
    </MutationForm>
  );
}

function EvidenceEditor({ evidence, onClose }: { evidence: Evidence; onClose: () => void }) {
  return (
    <MutationForm title="Correct evidence" onClose={onClose}>
      <input type="hidden" name="evidenceId" value={evidence.id} />
      <Field label="What happened">
        <Textarea name="summary" defaultValue={evidence.summary} required maxLength={5000} />
      </Field>
      <Field label="Date">
        <Input name="occurredOn" type="date" defaultValue={evidence.occurred_on} required className={fieldClassName} />
      </Field>
      <Field label="Signal">
        <select name="signal" defaultValue={evidence.signal} className={selectClassName}>
          <option value="supports">Supports</option>
          <option value="challenges">Challenges</option>
          <option value="neutral">Neutral</option>
        </select>
      </Field>
      <PendingButton name="operation" value="correctEvidence" className="h-12 w-full rounded-xl">
        Save correction
      </PendingButton>
      <PendingButton name="operation" value="archiveEvidence" variant="ghost" className="h-11 w-full rounded-xl text-destructive">
        <Archive /> Remove from Life Model
      </PendingButton>
    </MutationForm>
  );
}

function AreaOrderButton({
  areaIds,
  areaIndex,
  direction,
}: {
  areaIds: string[];
  areaIndex: number;
  direction: "up" | "down";
}) {
  const router = useRouter();
  const [state, action] = useActionState(mutateLifeModelAction, initialLifeModelActionState);
  const nextIndex = direction === "up" ? areaIndex - 1 : areaIndex + 1;
  const disabled = nextIndex < 0 || nextIndex >= areaIds.length;
  const ordered = [...areaIds];
  if (!disabled) [ordered[areaIndex], ordered[nextIndex]] = [ordered[nextIndex], ordered[areaIndex]];

  useEffect(() => {
    if (state.saved) router.refresh();
  }, [router, state.saved, state.version]);

  return (
    <form action={action}>
      <input type="hidden" name="operation" value="reorderLifeAreas" />
      {ordered.map((id) => <input key={id} type="hidden" name="orderedLifeAreaId" value={id} />)}
      <PendingButton
        type="submit"
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-label={`Move Life Area ${direction}`}
      >
        {direction === "up" ? <ArrowUp /> : <ArrowDown />}
        {direction === "up" ? "Up" : "Down"}
      </PendingButton>
    </form>
  );
}

function TargetFields({ item }: { item: Goal | Project }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Target start">
        <Input name="targetStartDate" type="date" defaultValue={item.target_start_date ?? ""} className={fieldClassName} />
      </Field>
      <Field label="Target end">
        <Input name="targetEndDate" type="date" defaultValue={item.target_end_date ?? ""} className={fieldClassName} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Target confidence">
          <select name="targetConfidence" defaultValue={item.target_confidence ?? ""} className={selectClassName}>
            <option value="">No target dates</option>
            <option value="estimated">Estimated</option>
            <option value="aspirational">Aspirational</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function WeekdayFields({ selected }: { selected: number[] }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Days</legend>
      <div className="grid grid-cols-7 gap-1.5">
        {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
          <label key={`${label}-${index}`} className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-secondary text-sm">
            <input name="weekday" type="checkbox" value={index} defaultChecked={selected.includes(index)} className="sr-only peer" />
            <span className="flex size-full items-center justify-center rounded-xl peer-checked:bg-primary peer-checked:text-primary-foreground">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function SaveButton() {
  return (
    <PendingButton className="h-12 w-full rounded-xl">Save changes</PendingButton>
  );
}

function TransitionButton({
  operation,
  status,
  destructive = false,
  children,
}: {
  operation: "transitionGoal" | "transitionProject" | "transitionRoutine";
  status: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PendingButton
      name="operation"
      value={operation}
      formAction={undefined}
      variant="outline"
      className={`h-11 rounded-xl ${destructive ? "border-destructive/50 text-destructive" : ""}`}
      onClick={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        let statusInput = form.elements.namedItem("newStatus") as HTMLInputElement | null;
        if (!statusInput) {
          statusInput = document.createElement("input");
          statusInput.type = "hidden";
          statusInput.name = "newStatus";
          form.append(statusInput);
        }
        statusInput.value = status;
      }}
    >
      {children}
    </PendingButton>
  );
}

function formatAreaCounts(area: Area) {
  const parts = [
    countLabel(area.goals.length, "goal"),
    countLabel(area.projects.length, "project"),
    countLabel(area.routines.length, "routine"),
  ].filter(Boolean);
  return parts.join(" · ") || "Confirmed Life Area";
}

function countLabel(count: number, noun: string) {
  return count > 0 ? `${count} ${noun}${count === 1 ? "" : "s"}` : null;
}

function formatRoutineCadence(routine: Routine) {
  if (routine.cadence === "daily") return "Daily";
  if (routine.cadence === "weekly") return "Weekly";
  if (routine.cadence === "times_per_week") return `${routine.cadence_count} times a week`;
  return routine.weekdays.map((day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]).join(", ");
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}
