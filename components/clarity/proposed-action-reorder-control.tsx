"use client";

import { GripVertical } from "lucide-react";
import type { PointerEventHandler } from "react";

export function ProposedActionReorderControl({
  actionTitle,
  disabled,
  canMoveUp,
  canMoveDown,
  onMoveStep,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  actionTitle: string;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveStep: (direction: -1 | 1) => void;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPointerMove: PointerEventHandler<HTMLButtonElement>;
  onPointerUp: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: PointerEventHandler<HTMLButtonElement>;
}) {
  return (
    <div data-reorder-control className="flex shrink-0 items-center">
      <button
        type="button"
        data-reorder-handle
        disabled={disabled}
        aria-label={`Reorder ${actionTitle}. Use Move up or Move down.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" && canMoveUp) {
            event.preventDefault();
            event.stopPropagation();
            onMoveStep(-1);
          }
          if (event.key === "ArrowDown" && canMoveDown) {
            event.preventDefault();
            event.stopPropagation();
            onMoveStep(1);
          }
        }}
        className="flex size-11 touch-none select-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
      >
        <GripVertical className="size-4" />
        <span className="sr-only">Move up or Move down</span>
      </button>
    </div>
  );
}
