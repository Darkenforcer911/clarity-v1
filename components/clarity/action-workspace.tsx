"use client";

import {
  Clock3,
  History,
  MoreHorizontal,
  NotebookPen,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  ActionAssistantMessage,
  ActionNote,
  DailyAction,
} from "@/lib/clarity/daily-loop-queries";
import { ChangeActionTimeForm } from "./change-action-time-form";
import { AskClarityPanel } from "./ask-clarity-panel";
import { ActionUpdateHistory } from "./action-update-history";
import { CorrectCompletionTimeForm } from "./correct-completion-time-form";
import { LogActionUpdate } from "./log-action-note";
import { RemoveActionPanel } from "./remove-action-panel";

type OpenPanel =
  | "ask"
  | "time"
  | "completion-time"
  | "log"
  | "updates"
  | "remove"
  | null;

export function ActionWorkspace({
  action,
  messages,
  updates,
  timezone,
  scheduledTimeInput,
  completionTimeInput,
}: {
  action: DailyAction;
  messages: ActionAssistantMessage[];
  updates: ActionNote[];
  timezone: string;
  scheduledTimeInput: string;
  completionTimeInput: string;
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
    router.refresh();
  }, [router]);

  const handleTimeSaved = useCallback(() => {
    setOpenPanel(null);
    setStatusMessage("Changes saved.");
    router.refresh();
  }, [router]);

  const handleCompletionTimeSaved = useCallback(() => {
    setOpenPanel(null);
    setStatusMessage("Completion time updated.");
    router.refresh();
  }, [router]);

  const handleUpdateDeleted = useCallback(
    (updateId: string) => {
      setDeletedUpdateIds((current) => new Set(current).add(updateId));
      setStatusMessage("Update deleted.");
      router.refresh();
    },
    [router],
  );

  const handleClarityChangeApplied = useCallback(() => {
    setStatusMessage("Changes saved.");
    router.refresh();
  }, [router]);

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
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <AskClarityPanel
            actionId={action.id}
            messages={messages}
            timezone={timezone}
            open={openPanel === "ask"}
            onToggle={() =>
              setOpenPanel((current) => {
                setStatusMessage(null);
                return current === "ask" ? null : "ask";
              })
            }
            onChangeApplied={handleClarityChangeApplied}
          />
        </div>
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
            <DropdownMenuItem
              onSelect={() => openWorkspacePanel("remove")}
              className="min-h-11 cursor-pointer rounded-lg text-destructive focus:text-destructive"
            >
              <Trash2 />
              Remove from today
            </DropdownMenuItem>
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
      {openPanel === "remove" && (
        <RemoveActionPanel
          actionId={action.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
    </div>
  );
}
