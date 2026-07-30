"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type RecapDayContext = {
  id: string;
  text: string;
};

export function RecapContextReview({
  items,
  onChange,
  onRemove,
}: {
  items: RecapDayContext[];
  onChange: (item: RecapDayContext) => void;
  onRemove: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Other context
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-border bg-card px-4 py-3"
          >
            {editingId === item.id ? (
              <div className="space-y-2">
                <Textarea
                  value={draft}
                  maxLength={1000}
                  onChange={(event) =>
                    setDraft(event.currentTarget.value)
                  }
                  className="min-h-16 rounded-xl"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!draft.trim()}
                    onClick={() => {
                      onChange({ ...item, text: draft.trim() });
                      setEditingId(null);
                    }}
                    className="h-9 rounded-lg"
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    className="h-9 rounded-lg text-muted-foreground"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm leading-6">{item.text}</p>
                <div className="mt-1 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDraft(item.text);
                      setEditingId(item.id);
                    }}
                    className="h-9 px-2 text-xs text-muted-foreground"
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(item.id)}
                    className="h-9 px-2 text-xs text-destructive hover:text-destructive"
                  >
                    Remove
                  </Button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
