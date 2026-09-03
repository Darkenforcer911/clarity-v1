"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { completedPlanEvidenceInputSchema } from "@/lib/clarity/completed-plan-evidence";

import { ActionFields } from "./action-fields";
import { ClarityFormHeader } from "./clarity-form-header";

export type RecapCompletedItem = {
  id: string;
  title: string;
  completionTime: string;
  actualMinutes: number | null;
  details?: string | null;
};

export function RecapCompletedItemForm({
  initialItem,
  onSave,
  onCancel,
  embedded = false,
  submitting = false,
  submitLabel,
  showDetails = false,
}: {
  initialItem?: RecapCompletedItem;
  onSave: (item: RecapCompletedItem) => void;
  onCancel: () => void;
  embedded?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  showDetails?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function save() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    const parsed = completedPlanEvidenceInputSchema.safeParse({
      title: formData.get("title"),
      completedTime: formData.get("completedTime") ?? "",
      actualMinutes: formData.get("actualMinutes") ?? "",
      details: formData.get("details") ?? "",
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      setFieldErrors(flattened.fieldErrors as Record<string, string[]>);
      setError(flattened.formErrors[0] ?? null);
      return;
    }

    setFieldErrors({});
    setError(null);
    onSave({
      id: initialItem?.id ?? crypto.randomUUID(),
      title: parsed.data.title,
      completionTime: parsed.data.completedTime ?? "",
      actualMinutes: parsed.data.actualMinutes,
      details: parsed.data.details,
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className={
        embedded
          ? "w-full min-w-0 max-w-full space-y-5 text-foreground"
          : "w-full min-w-0 max-w-full space-y-5 rounded-2xl border border-border bg-card p-5 text-foreground"
      }
    >
      {!embedded && (
        <ClarityFormHeader
          title={initialItem ? "Edit completed item" : "Add something completed"}
          subtitle="Something you did that wasn't planned"
          closeLabel="Close completed item form"
          onClose={onCancel}
        />
      )}

      <ActionFields
        mode="completed"
        simple
        showDue={false}
        showRecurrence={false}
        showReminders={false}
        showDetails={showDetails}
        state={{ fieldErrors }}
        initialValues={{
          title: initialItem?.title,
          completedTime: initialItem?.completionTime,
          actualMinutes: initialItem?.actualMinutes,
          details: initialItem?.details ?? "",
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={submitting}
        className="h-12 w-full rounded-xl text-base"
      >
        {submitting
          ? "Saving…"
          : submitLabel ??
            (initialItem ? "Save changes" : "Add completed item")}
      </Button>
    </form>
  );
}
