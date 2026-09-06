"use client";

import {
  ChevronDown,
  Clock3,
  History,
  NotebookPen,
  Pencil,
  Trash2,
} from "lucide-react";
import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { updateActionAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import type {
  ActionLifeContext,
  ActionNote,
  DailyAction,
} from "@/lib/clarity/daily-loop-queries";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { ActionFields } from "./action-fields";
import { ActionRepeatSeriesControls } from "./action-repeat-series-controls";
import { ActionUpdateHistory } from "./action-update-history";
import { CorrectCompletionTimeForm } from "./correct-completion-time-form";
import { LogActionUpdate } from "./log-action-note";
import { RemoveActionPanel } from "./remove-action-panel";
import { PendingButton } from "./pending-button";

type OpenPanel =
  | "edit"
  | "completion-time"
  | "log"
  | "updates"
  | "remove"
  | null;

export function ActionWorkspace({
  action,
  updates,
  timezone,
  scheduledTimeInput,
  completionTimeInput,
  localDate,
  routine,
  returnHref,
  activeToday,
  editable,
  currentDate,
}: {
  action: DailyAction;
  updates: ActionNote[];
  timezone: string;
  scheduledTimeInput: string;
  completionTimeInput: string;
  localDate: string;
  routine: ActionLifeContext["routine"];
  returnHref: string;
  activeToday: boolean;
  editable: boolean;
  currentDate: boolean;
}) {
  const router = useRouter();
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deletedUpdateIds, setDeletedUpdateIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const visibleUpdates = updates.filter(
    (update) => !deletedUpdateIds.has(update.id),
  );

  const handleUpdateSaved = useCallback(() => {
    setOpenPanel(null);
    setStatusMessage("Update saved.");
  }, []);

  const handleTimeSaved = useCallback(() => {
    setOpenPanel(null);
    setStatusMessage("Changes saved.");
  }, []);

  const handleCompletionTimeSaved = useCallback(() => {
    setOpenPanel(null);
    setStatusMessage("Completion time updated.");
  }, []);

  const handleUpdateDeleted = useCallback(
    (updateId: string) => {
      setDeletedUpdateIds((current) => new Set(current).add(updateId));
      setStatusMessage("Update deleted.");
    },
    [],
  );

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setStatusMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  function openWorkspacePanel(panel: OpenPanel) {
    setStatusMessage(null);
    setOpenPanel(panel);
  }

  const removable = action.status === "active" || action.status === "proposed";
  const recurring = routine?.status === "active";
  const hasMore =
    recurring || action.status === "completed" || activeToday || visibleUpdates.length > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {editable && (
          <Button
            type="button"
            variant="outline"
            onClick={() => openWorkspacePanel("edit")}
            className="h-11 rounded-xl"
          >
            <Pencil />
            Edit
          </Button>
        )}
        {removable && (
          <Button
            type="button"
            variant="outline"
            onClick={() => openWorkspacePanel("remove")}
            className="h-11 rounded-xl"
          >
            <Trash2 />
            {recurring
              ? currentDate
                ? "Skip today"
                : "Skip this occurrence"
              : currentDate
                ? "Remove from today"
                : "Remove this occurrence"}
          </Button>
        )}
      </div>

      {statusMessage && (
        <p
          role="status"
          className="rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-[var(--clarity-completed)]"
        >
          {statusMessage}
        </p>
      )}

      {openPanel === "edit" && editable && (
        <ActionEditForm
          action={action}
          localDate={localDate}
          timezone={timezone}
          scheduledTimeInput={scheduledTimeInput}
          routine={routine}
          onClose={() => setOpenPanel(null)}
          onSaved={handleTimeSaved}
        />
      )}
      {openPanel === "completion-time" &&
        action.status === "completed" && (
          <CorrectCompletionTimeForm
            actionId={action.id}
            completionTimeInput={completionTimeInput}
            completionTimeUnknown={action.completion_time_unknown}
            onClose={() => setOpenPanel(null)}
            onSaved={handleCompletionTimeSaved}
          />
        )}
      {openPanel === "log" && activeToday && (
        <LogActionUpdate
          actionId={action.id}
          onClose={() => setOpenPanel(null)}
          onSaved={handleUpdateSaved}
        />
      )}
      {openPanel === "updates" && (
        <ActionUpdateHistory
          updates={visibleUpdates}
          timezone={timezone}
          onClose={() => setOpenPanel(null)}
          onDeleted={handleUpdateDeleted}
        />
      )}
      {openPanel === "remove" &&
        (action.status === "active" || action.status === "proposed") && (
        <RemoveActionPanel
          actionId={action.id}
          occurrenceOnly={recurring || action.status === "proposed"}
          actionTitle={action.title}
          skipToday={recurring}
          currentDate={currentDate}
          onClose={() => setOpenPanel(null)}
          onRemoved={() => {
            router.push(returnHref);
            router.refresh();
          }}
        />
      )}
      {hasMore && openPanel === null && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMoreOpen((current) => !current)}
            aria-expanded={moreOpen}
            className="h-10 w-full text-muted-foreground"
          >
            More
            <ChevronDown className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          </Button>
          {moreOpen && (
            <div className="space-y-2" data-recurring-day-item-more={recurring || undefined}>
              {recurring && routine && (
                <ActionRepeatSeriesControls
                  actionId={action.id}
                  actionTitle={action.title}
                  cadence={routine.cadence}
                  selectedWeekdays={routine.weekdays}
                  onSaved={() => {
                    setMoreOpen(false);
                    setStatusMessage("Repeat updated.");
                    router.refresh();
                  }}
                />
              )}
              {action.status === "completed" && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => openWorkspacePanel("completion-time")}
                  className="h-10 w-full"
                >
                  <Clock3 />
                  Correct completion time
                </Button>
              )}
              {activeToday && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => openWorkspacePanel("log")}
                  className="h-10 w-full"
                >
                  <NotebookPen />
                  Log update
                </Button>
              )}
              {visibleUpdates.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => openWorkspacePanel("updates")}
                  className="h-10 w-full"
                >
                  <History />
                  View updates ({visibleUpdates.length})
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionEditForm({
  action,
  localDate,
  timezone,
  scheduledTimeInput,
  routine,
  onClose,
  onSaved,
}: {
  action: DailyAction;
  localDate: string;
  timezone: string;
  scheduledTimeInput: string;
  routine: ActionLifeContext["routine"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useActionState(
    updateActionAction,
    initialDailyLoopActionState,
  );

  useEffect(() => {
    if (state.updateSucceededAt) onSaved();
  }, [onSaved, state.updateSucceededAt]);

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-2xl border border-border bg-card p-4"
    >
      <input type="hidden" name="actionId" value={action.id} />
      <ActionFields
        state={state}
        simple
        hideGeneratedDetails
        localDate={localDate}
        timezone={timezone}
        initialValues={{
          title: action.title,
          estimatedMinutes: action.estimated_minutes,
          scheduledTime: scheduledTimeInput,
          details: action.details ?? "",
          dueLocalDate: action.due_local_date ?? "",
          dueLocalTime: action.due_local_time?.slice(0, 5) ?? "",
          reminderOffsets: action.reminder_offsets_minutes,
          recurrencePattern:
            routine?.status === "active" ? routine.cadence : "none",
          recurrenceDays:
            routine?.status === "active" ? routine.weekdays : [],
          whyItExists: action.why_it_exists,
          definitionOfDone: action.definition_of_done,
          suggestedMethod: action.suggested_method,
        }}
      />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <PendingButton type="submit" pendingLabel="Saving…">
          Save
        </PendingButton>
      </div>
    </form>
  );
}
