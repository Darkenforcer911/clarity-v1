"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type RecapCompletedItem = {
  id: string;
  title: string;
  completionTime: string;
};

export function RecapCompletedItemForm({
  initialItem,
  onSave,
  onCancel,
}: {
  initialItem?: RecapCompletedItem;
  onSave: (item: RecapCompletedItem) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialItem?.title ?? "");
  const [completionTime, setCompletionTime] = useState(
    initialItem?.completionTime ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      setError("Enter what you completed.");
      return;
    }

    if (
      completionTime &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(completionTime)
    ) {
      setError("Choose a valid completion time.");
      return;
    }

    onSave({
      id: initialItem?.id ?? crypto.randomUUID(),
      title: normalizedTitle,
      completionTime,
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-transparent p-3">
      <label className="block min-w-0 space-y-2">
        <span className="text-sm font-semibold">What did you complete?</span>
        <Input
          value={title}
          maxLength={200}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          onChange={(event) => {
            setTitle(event.currentTarget.value);
            setError(null);
          }}
          className="h-11 rounded-xl"
        />
      </label>
      <label className="block min-w-0 space-y-2">
        <span className="text-sm font-semibold">
          When? <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <Input
          type="time"
          value={completionTime}
          onChange={(event) => {
            setCompletionTime(event.currentTarget.value);
            setError(null);
          }}
          className="h-11 rounded-xl"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="h-11 rounded-xl"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={save}
          className="h-11 rounded-xl"
        >
          {initialItem ? "Save changes" : "Add completed item"}
        </Button>
      </div>
    </section>
  );
}
