"use client";

import { History, MoreHorizontal, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { deleteActionUpdateAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionNote } from "@/lib/clarity/daily-loop-queries";

export function ActionUpdateHistory({
  updates,
  timezone,
  onClose,
  onDeleted,
}: {
  updates: ActionNote[];
  timezone: string;
  onClose?: () => void;
  onDeleted: (updateId: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function requestDelete(updateId: string) {
    setDeleteError(null);
    setConfirmingId(updateId);
  }

  function deleteUpdate(updateId: string) {
    setDeleteError(null);
    startDelete(async () => {
      try {
        const result = await deleteActionUpdateAction(updateId);

        if (!result.success) {
          setDeleteError(
            result.error ?? "Couldn’t delete the update. Try again.",
          );
          return;
        }

        setConfirmingId(null);
        onDeleted(updateId);
      } catch {
        setDeleteError(
          "Couldn’t delete the update. Try again.",
        );
      }
    });
  }

  return (
    <section className="rounded-2xl bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="size-5 text-[var(--clarity-completed)]" />
          <h2 className="font-semibold">Updates</h2>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close update history"
            className="rounded-xl"
          >
            <X />
          </Button>
        )}
      </div>

      {updates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No updates yet.</p>
      ) : (
        <ol className="divide-y divide-border">
          {updates.map((update) => (
            <li key={update.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6">
                  {update.note}
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="-mr-2 size-8 shrink-0 rounded-lg text-muted-foreground"
                      aria-label="Update options"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-40 rounded-xl border-border bg-card p-2"
                  >
                    <DropdownMenuItem
                      onSelect={() => requestDelete(update.id)}
                      className="min-h-10 cursor-pointer rounded-lg"
                    >
                      Delete update
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <time
                dateTime={update.created_at}
                className="mt-2 block text-xs text-muted-foreground"
              >
                {formatUpdateTime(update.created_at, timezone)}
              </time>
              {confirmingId === update.id && (
                <div className="mt-3 rounded-xl bg-secondary p-3">
                  <p className="text-sm font-semibold">
                    Delete this update?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isDeleting}
                      onClick={() => deleteUpdate(update.id)}
                      className="rounded-lg"
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isDeleting}
                      onClick={() => {
                        setConfirmingId(null);
                        setDeleteError(null);
                      }}
                      className="rounded-lg"
                    >
                      Cancel
                    </Button>
                  </div>
                  {deleteError && (
                    <p className="mt-3 text-sm" role="alert">
                      {deleteError}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function HistoricalActionUpdates({
  updates,
  timezone,
}: {
  updates: ActionNote[];
  timezone: string;
}) {
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const visibleUpdates = updates.filter(
    (update) => !deletedIds.has(update.id),
  );

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = window.setTimeout(
      () => setStatusMessage(null),
      3000,
    );
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  function handleDeleted(updateId: string) {
    setDeletedIds((current) => new Set(current).add(updateId));
    setStatusMessage("Update deleted.");
  }

  return (
    <div className="space-y-3">
      {statusMessage && (
        <p
          role="status"
          className="rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-[var(--clarity-completed)]"
        >
          {statusMessage}
        </p>
      )}
      <ActionUpdateHistory
        updates={visibleUpdates}
        timezone={timezone}
        onDeleted={handleDeleted}
      />
    </div>
  );
}

function formatUpdateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
