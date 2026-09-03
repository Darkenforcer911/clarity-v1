"use client";

import {
  Clock3,
  History,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Trash2,
} from "lucide-react";
import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { updateActionAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  ActionLifeContext,
  ActionNote,
  DailyAction,
} from "@/lib/clarity/daily-loop-queries";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { ActionFields } from "./action-fields";
import { ChangeActionTimeForm } from "./change-action-time-form";
import { ActionUpdateHistory } from "./action-update-history";
import { CorrectCompletionTimeForm } from "./correct-completion-time-form";
import { LogActionUpdate } from "./log-action-note";
import { RemoveActionPanel } from "./remove-action-panel";
import { PendingButton } from "./pending-button";

type OpenPanel =
  | "time"
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
}) {
  const router = useRouter();
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
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

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-12 shrink-0 rounded-xl"
              aria-label="More action options"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 rounded-xl border-border bg-card p-2"
          >
            {editable && (
              <>
                <DropdownMenuItem
                  onSelect={() => openWorkspacePanel("edit")}
                  className="min-h-11 cursor-pointer rounded-lg"
                >
                  <Pencil />
                  Edit action
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => openWorkspacePanel("time")}
                  className="min-h-11 cursor-pointer rounded-lg"
                >
                  <Clock3 />
                  Change time
                </DropdownMenuItem>
              </>
            )}
            {action.status === "completed" && (
              <DropdownMenuItem
                onSelect={() => openWorkspacePanel("completion-time")}
                className="min-h-11 cursor-pointer rounded-lg"
              >
                <Clock3 />
                Correct completion time
              </DropdownMenuItem>
            )}
            {activeToday && (
              <DropdownMenuItem
                onSelect={() => openWorkspacePanel("log")}
                className="min-h-11 cursor-pointer rounded-lg"
              >
                <NotebookPen />
                Log update
              </DropdownMenuItem>
            )}
            {visibleUpdates.length > 0 && (
              <DropdownMenuItem
                onSelect={() => openWorkspacePanel("updates")}
                className="min-h-11 cursor-pointer rounded-lg"
              >
                <History />
                View updates ({visibleUpdates.length})
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {statusMessage && (
        <p
          role="status"
          className="rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-[var(--clarity-completed)]"
        >
          {statusMessage}
        </p>
      )}

      {openPanel === "time" && editable && (
        <ChangeActionTimeForm
          action={action}
          scheduledTimeInput={scheduledTimeInput}
          onClose={() => setOpenPanel(null)}
          onSaved={handleTimeSaved}
        />
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
          occurrenceOnly={action.status === "proposed"}
          onClose={() => setOpenPanel(null)}
          onRemoved={() => {
            router.push(returnHref);
            router.refresh();
          }}
        />
      )}
      {(action.status === "active" || action.status === "proposed") &&
        openPanel !== "remove" && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => openWorkspacePanel("remove")}
          className="h-10 w-auto justify-start rounded-lg px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
          {action.status === "active" ? "Remove from today" : "Remove Action"}
        </Button>
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
          recurrencePattern: routine?.cadence ?? "none",
          recurrenceDays: routine?.weekdays ?? [],
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
