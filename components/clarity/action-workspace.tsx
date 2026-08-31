"use client";

import {
  Clock3,
  History,
  MoreHorizontal,
  NotebookPen,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionNote, DailyAction } from "@/lib/clarity/daily-loop-queries";
import { ChangeActionTimeForm } from "./change-action-time-form";
import { ActionUpdateHistory } from "./action-update-history";
import { CorrectCompletionTimeForm } from "./correct-completion-time-form";
import { LogActionUpdate } from "./log-action-note";
import { RemoveActionPanel } from "./remove-action-panel";

type OpenPanel =
  | "time"
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
}: {
  action: DailyAction;
  updates: ActionNote[];
  timezone: string;
  scheduledTimeInput: string;
  completionTimeInput: string;
}) {
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
            <DropdownMenuItem
              onSelect={() => openWorkspacePanel("time")}
              className="min-h-11 cursor-pointer rounded-lg"
            >
              <Clock3 />
              Change time
            </DropdownMenuItem>
            {action.status === "completed" && (
              <DropdownMenuItem
                onSelect={() => openWorkspacePanel("completion-time")}
                className="min-h-11 cursor-pointer rounded-lg"
              >
                <Clock3 />
                Correct completion time
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => openWorkspacePanel("log")}
              className="min-h-11 cursor-pointer rounded-lg"
            >
              <NotebookPen />
              Log update
            </DropdownMenuItem>
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

      {openPanel === "time" && (
        <ChangeActionTimeForm
          action={action}
          scheduledTimeInput={scheduledTimeInput}
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
      {openPanel === "log" && (
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
      {openPanel === "remove" && action.status === "active" && (
        <RemoveActionPanel
          actionId={action.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {action.status === "active" && openPanel !== "remove" && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => openWorkspacePanel("remove")}
          className="h-10 w-auto justify-start rounded-lg px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
          Remove from today
        </Button>
      )}
    </div>
  );
}
