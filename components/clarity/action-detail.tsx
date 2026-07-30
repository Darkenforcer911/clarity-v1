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
import type {
  ActionAssistantMessage,
  ActionNote,
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import {
  formatLocalDateTime,
  formatFullLocalDate,
  formatScheduledTime,
  formatWeekday,
} from "@/lib/clarity/date-time";
import { ActionWorkspace } from "./action-workspace";
import { ActionCompletionControl } from "./action-completion-control";
import { HistoricalActionUpdates } from "./action-update-history";
import { OngoingContextPrompt } from "./ongoing-context-prompt";

export function ActionDetail({
  action,
  plan,
  profile,
  messages,
  updates,
  readOnly = false,
  backHref = "/today",
}: {
  action: DailyAction;
  plan: DailyPlan;
  profile: Profile;
  messages: ActionAssistantMessage[];
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
    !linkedContext && isMeaningfulWhy(action.why_it_exists, plan.focus)
      ? action.why_it_exists
      : null;
  const usefulDone = isUsefulGeneratedDetail(action.definition_of_done);
  const usefulMethod = isUsefulGeneratedDetail(action.suggested_method);

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
            : "Back to Today"}
        </Link>
      </Button>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight tracking-[-0.04em]">
          {action.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Clock3 className="size-4" />
          <span>{scheduledTime ? `At ${scheduledTime}` : "Anytime today"}</span>
          <span aria-hidden="true">·</span>
          <span>{action.estimated_minutes} minutes</span>
          {action.recurrence_pattern !== "none" && (
            <>
              <span aria-hidden="true">·</span>
              <Repeat2 className="size-4" />
              <span>{recurrenceCopy(action)}</span>
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
            Completed {formatWeekday(plan.local_date)} · Time not recorded
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

      {!readOnly && (
        <ActionCompletionControl
          actionId={action.id}
          completed={completed}
          completionTime={completionTime}
        />
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
      ) : (
        <ActionWorkspace
          action={action}
          messages={messages}
          updates={updates}
          timezone={profile.timezone}
          scheduledTimeInput={scheduledTimeInput}
          completionTimeInput={completionTimeInput}
        />
      )}
    </section>
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

function recurrenceCopy(action: DailyAction) {
  if (action.recurrence_pattern === "daily") {
    return "Daily";
  }

  if (action.recurrence_pattern === "weekly") {
    return "Weekly";
  }

  if (action.recurrence_pattern === "certain_days") {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return action.recurrence_days.map((day) => labels[day]).join(", ");
  }

  return "";
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
