import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock3,
  Link2,
  MessageSquareText,
  Repeat2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatReminderSummary } from "@/lib/clarity/calendar-commitment-form-ui";
import type {
  ActionLifeContext,
  ActionNote,
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import { buildActionClarityHref } from "@/lib/clarity/clarity-action-context";
import {
  formatLocalDateTime,
  formatFullLocalDate,
  formatScheduledTime,
  formatWeekday,
  getLocalDate,
} from "@/lib/clarity/date-time";
import { formatDuration } from "@/lib/clarity/duration";
import { ActionWorkspace } from "./action-workspace";
import { ActionCompletionControl } from "./action-completion-control";
import { HistoricalActionUpdates } from "./action-update-history";
import { OngoingContextPrompt } from "./ongoing-context-prompt";
import { DayItemWorkspaceShell } from "./day-item-workspace-shell";

export function ActionDetail({
  action,
  plan,
  profile,
  lifeContext,
  updates,
  readOnly = false,
  backHref = "/today",
}: {
  action: DailyAction;
  plan: DailyPlan | null;
  profile: Profile;
  lifeContext: ActionLifeContext;
  updates: ActionNote[];
  readOnly?: boolean;
  backHref?: string;
}) {
  const completed = action.status === "completed";
  const scheduledTime = formatScheduledTime(
    action.scheduled_time,
    profile.timezone,
  );
  const completedAt = formatLocalDateTime(
    action.completed_at,
    profile.timezone,
  );
  const completionTime = formatScheduledTime(
    action.completed_at,
    profile.timezone,
  );
  const scheduledTimeInput = action.scheduled_time
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: profile.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(action.scheduled_time))
    : "";
  const completionTimeInput = action.completed_at
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: profile.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(action.completed_at))
    : "";
  const linkedContext = extractLinkedContext(action.why_it_exists);
  const meaningfulWhy =
    !linkedContext && isMeaningfulWhy(action.why_it_exists, plan?.focus ?? null)
      ? action.why_it_exists
      : null;
  const usefulDone = isUsefulGeneratedDetail(action.definition_of_done);
  const usefulMethod = isUsefulGeneratedDetail(action.suggested_method);
  const activeToday =
    plan?.status === "active" &&
    action.local_date === getLocalDate(profile.timezone) &&
    ["active", "completed"].includes(action.status);
  const completedCurrentProposalAction =
    plan?.status === "proposed" &&
    action.local_date === getLocalDate(profile.timezone) &&
    action.status === "completed" &&
    !action.completion_evidence_only &&
    action.approved_at === null;
  const editable =
    action.status === "active" ||
    (action.status === "proposed" &&
      action.local_date >= getLocalDate(profile.timezone));
  const recurrence = recurrenceCopy(lifeContext.routine);
  const displayedDuration = completed
    ? action.actual_minutes
      ? formatDuration(action.actual_minutes)
      : null
    : action.estimated_minutes > 0
      ? formatDuration(action.estimated_minutes)
      : null;

  return (
    <section className="space-y-6">
      <Button
        asChild
        variant="ghost"
        className="-ml-3 h-10 rounded-xl text-muted-foreground"
      >
        <Link href={backHref}>
          <ArrowLeft />
          {readOnly && backHref === "/today/summary"
            ? "Back to summary"
            : backHref.startsWith("/calendar")
              ? "Back to Calendar"
            : "Back to Today"}
        </Link>
      </Button>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight tracking-[-0.04em]">
          {action.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Clock3 className="size-4" />
          <span>
            {scheduledTime
              ? `At ${scheduledTime}`
              : `Anytime ${formatWeekday(action.local_date)}`}
          </span>
          {displayedDuration && (
            <>
              <span aria-hidden="true">·</span>
              <span>{displayedDuration}</span>
            </>
          )}
          {recurrence && (
            <>
              <span aria-hidden="true">·</span>
              <Repeat2 className="size-4" />
              <span>{recurrence}</span>
            </>
          )}
        </div>
        {completedAt && (
          <p className="text-xs text-muted-foreground">
            Completed {completedAt}
          </p>
        )}
        {completed && action.completion_time_unknown && (
          <p className="text-xs text-muted-foreground">
            Completed {formatWeekday(action.local_date)} · Time not recorded
          </p>
        )}
      </div>

      {action.linked_context_label && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link2 className="size-4 text-[var(--clarity-completed)]" />
          <span>
            Linked to{" "}
            <strong className="font-semibold text-foreground">
              {action.linked_context_label}
            </strong>
          </span>
        </div>
      )}

      <ActionLifeRelationships lifeContext={lifeContext} />

      {(action.due_local_date || action.reminder_offsets_minutes.length > 0) && (
        <dl className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
          {action.due_local_date && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Due</dt>
              <dd className="text-right font-medium">
                {formatActionDue(action.due_local_date, action.due_local_time)}
              </dd>
            </div>
          )}
          {action.reminder_offsets_minutes.length > 0 && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Reminder</dt>
              <dd className="text-right font-medium">
                {formatReminderSummary(action.reminder_offsets_minutes)}
              </dd>
            </div>
          )}
        </dl>
      )}

      {linkedContext && (
        <div className="flex items-start gap-3 rounded-2xl bg-secondary p-4">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-[var(--clarity-completed)]" />
          <div>
            <p className="text-sm font-semibold">Context</p>
            <p className="mt-1 leading-6 text-muted-foreground">
              {linkedContext}
            </p>
          </div>
        </div>
      )}

      {action.ongoing_context_suggestion &&
        !action.ongoing_context_decision &&
        !readOnly && (
          <OngoingContextPrompt
            actionId={action.id}
            suggestion={action.ongoing_context_suggestion}
            destination={`/today/actions/${action.id}`}
          />
        )}

      <DayItemWorkspaceShell
        primary={
          activeToday || completedCurrentProposalAction ? (
            <ActionCompletionControl
              actionId={action.id}
              completed={completed}
              completionTime={completionTime}
            />
          ) : undefined
        }
        clarityHref={buildActionClarityHref(action.id)}
        secondary={
          !readOnly && (editable || activeToday) ? (
            <ActionWorkspace
              action={action}
              updates={updates}
              timezone={profile.timezone}
              scheduledTimeInput={scheduledTimeInput}
              completionTimeInput={completionTimeInput}
              localDate={action.local_date}
              routine={lifeContext.routine}
              returnHref={backHref}
              activeToday={activeToday}
              editable={editable}
            />
          ) : undefined
        }
      />

      {action.details && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Details</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {action.details}
          </p>
        </div>
      )}

      <div className="rounded-2xl bg-card p-5">
        <dl className="space-y-5">
          {usefulDone && (
            <Detail
              icon={<Check />}
              label="Done when"
              value={action.definition_of_done}
            />
          )}
          {usefulMethod && (
            <Detail
              icon={<Clock3 />}
              label="Best approach"
              value={action.suggested_method}
            />
          )}
          {meaningfulWhy && (
            <Detail
              icon={<Link2 />}
              label="Why it matters"
              value={meaningfulWhy}
            />
          )}
        </dl>
      </div>

      {readOnly ? (
        <HistoricalActionRecord
          action={action}
          updates={updates}
          timezone={profile.timezone}
        />
      ) : null}
    </section>
  );
}

function ActionLifeRelationships({
  lifeContext,
}: {
  lifeContext: ActionLifeContext;
}) {
  const relationships = [
    lifeContext.project
      ? { label: "Project", title: lifeContext.project.title }
      : null,
    lifeContext.goal
      ? { label: "Goal", title: lifeContext.goal.title }
      : null,
  ].filter((relationship): relationship is { label: string; title: string } =>
    Boolean(relationship),
  );

  if (relationships.length === 0) return null;

  return (
    <dl className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
      {relationships.map((relationship) => (
        <div key={relationship.label} className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{relationship.label}</dt>
          <dd className="text-right font-medium">{relationship.title}</dd>
        </div>
      ))}
    </dl>
  );
}

function HistoricalActionRecord({
  action,
  updates,
  timezone,
}: {
  action: DailyAction;
  updates: ActionNote[];
  timezone: string;
}) {
  const outcome =
    action.status === "completed"
      ? action.completion_time_unknown
        ? "Completed · Time not recorded"
        : `Completed ${formatLocalDateTime(action.completed_at, timezone) ?? ""}`.trim()
      : action.status === "rescheduled" && action.rescheduled_for
        ? `Moved to ${formatFullLocalDate(action.rescheduled_for)}`
        : action.status === "dropped"
          ? "Dropped"
          : action.status;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Final outcome
        </p>
        <p className="mt-3 font-medium">{outcome}</p>
        {action.resolution_note && (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {action.resolution_note}
          </p>
        )}
      </section>

      {updates.length > 0 && (
        <HistoricalActionUpdates updates={updates} timezone={timezone} />
      )}
    </div>
  );
}

function recurrenceCopy(routine: ActionLifeContext["routine"]) {
  if (routine?.cadence === "daily") {
    return "Daily";
  }

  if (routine?.cadence === "weekly") {
    return "Weekly";
  }

  if (routine?.cadence === "certain_days") {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return routine.weekdays.map((day) => labels[day]).join(", ");
  }

  return "";
}

function formatActionDue(localDate: string, localTime: string | null) {
  const date = formatFullLocalDate(localDate);
  if (!localTime) return date;
  const [hourText, minute] = localTime.slice(0, 5).split(":");
  const hour = Number(hourText);
  return `${date} · ${hour % 12 || 12}:${minute} ${hour < 12 ? "am" : "pm"}`;
}

function extractLinkedContext(value: string) {
  return value.startsWith("Context: ") ? value.slice("Context: ".length) : null;
}

function isMeaningfulWhy(value: string, focus: string | null) {
  const normalized = value.trim().toLowerCase();
  const focusCopy = focus?.trim().toLowerCase();

  return !(
    normalized.startsWith("added because") ||
    normalized.startsWith("supports today’s focus") ||
    normalized.startsWith("supports today's focus") ||
    normalized.includes("moves the plan forward") ||
    normalized === "this is the work the user says is now needed." ||
    normalized === focusCopy
  );
}

function isUsefulGeneratedDetail(value: string) {
  const normalized = value.trim().toLowerCase();
  return !(
    normalized.includes("start with the smallest concrete step") ||
    normalized.includes("start with the smallest clear next step") ||
    normalized === "completing this moves the plan forward."
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3">
      <span className="mt-0.5 text-[var(--clarity-completed)] [&_svg]:size-5">
        {icon}
      </span>
      <div>
        <dt className="font-semibold">{label}</dt>
        <dd className="mt-1 leading-7 text-muted-foreground">{value}</dd>
      </div>
    </div>
  );
}
