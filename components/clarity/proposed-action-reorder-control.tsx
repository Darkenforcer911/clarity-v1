"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useRef, useState } from "react";

const DRAG_START_THRESHOLD_PX = 8;

export function ProposedActionReorderControl({
  actionId,
  actionTitle,
  disabled,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMoveStep,
}: {
  actionId: string;
  actionTitle: string;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragStart: () => void;
  onDragOver: (targetIndex: number) => void;
  onDragEnd: (cancelled: boolean) => void;
  onMoveStep: (direction: -1 | 1) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressClickRef = useRef(false);
  const gestureRef = useRef<{
    pointerId: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const menuId = `reorder-options-${actionId}`;

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || event.button !== 0) return;

    event.stopPropagation();
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      dragging: false,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (
      !gesture.dragging &&
      Math.abs(event.clientY - gesture.startY) < DRAG_START_THRESHOLD_PX
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!gesture.dragging) {
      gesture.dragging = true;
      suppressClickRef.current = true;
      setMenuOpen(false);
      onDragStart();
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-proposed-action-index]");
    const targetIndex = Number(target?.dataset.proposedActionIndex);

    if (Number.isInteger(targetIndex)) {
      onDragOver(targetIndex);
    }
  }

  function finishPointer(
    event: React.PointerEvent<HTMLButtonElement>,
    cancelled: boolean,
  ) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureRef.current = null;

    if (!gesture.dragging) return;

    onDragEnd(cancelled);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 50);
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (suppressClickRef.current) {
      event.preventDefault();
      return;
    }

    setMenuOpen((open) => !open);
  }

  function move(direction: -1 | 1) {
    onMoveStep(direction);
    setMenuOpen(false);
  }

  return (
    <div
      data-reorder-control
      className="flex shrink-0 flex-col items-center"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setMenuOpen(false);
        }
      }}
    >
      <button
        type="button"
        data-reorder-handle
        disabled={disabled}
        aria-label={`Reorder ${actionTitle}`}
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event, false)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onClick={handleClick}
        className="flex size-11 touch-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
      >
        <GripVertical className="size-4" />
      </button>

      {menuOpen && (
        <div
          id={menuId}
          role="group"
          aria-label={`Reorder ${actionTitle}`}
          className="mt-1 space-y-1 rounded-xl border border-border bg-card p-1"
        >
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={() => move(-1)}
            aria-label={`Move ${actionTitle} up`}
            className="flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
            <span className="sr-only">Move up</span>
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={() => move(1)}
            aria-label={`Move ${actionTitle} down`}
            className="flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <ArrowDown className="size-4" />
            <span className="sr-only">Move down</span>
          </button>
        </div>
      )}
    </div>
  );
}
