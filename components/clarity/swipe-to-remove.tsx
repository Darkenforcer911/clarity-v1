"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import {
  ACTIVE_ACTION_SWIPE_REVEAL_PX,
  resolveActiveActionSwipeOpen,
} from "@/lib/clarity/active-today-swipe";

export function SwipeToRemove({
  itemId,
  itemTitle,
  open,
  onOpenChange,
  onRemove,
  removalPending,
  removing,
  enabled,
  accessibilityContext,
  actionLabel = "Remove",
  pendingLabel = "Removing…",
  children,
}: {
  itemId: string;
  itemTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  removalPending: boolean;
  removing: boolean;
  enabled: boolean;
  accessibilityContext: string;
  actionLabel?: string;
  pendingLabel?: string;
  children: React.ReactNode;
}) {
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const offset = dragOffset ?? (open ? -ACTIVE_ACTION_SWIPE_REVEAL_PX : 0);
  const currentOffsetRef = useRef(offset);
  const suppressClickRef = useRef(false);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    horizontal: boolean | null;
  } | null>(null);

  function moveCard(nextOffset: number) {
    currentOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (
      !enabled ||
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest("[data-swipe-remove-control]"))
    ) {
      return;
    }

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset,
      horizontal: null,
    };
    currentOffsetRef.current = offset;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (gesture.horizontal === null) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 7) return;
      const startedOpen = gesture.startOffset < 0;
      gesture.horizontal =
        Math.abs(deltaX) > Math.abs(deltaY) && (startedOpen || deltaX < 0);
    }

    if (!gesture.horizontal) return;

    event.preventDefault();
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDragging(true);
    suppressClickRef.current = true;
    moveCard(
      Math.max(
        -ACTIVE_ACTION_SWIPE_REVEAL_PX,
        Math.min(0, gesture.startOffset + deltaX),
      ),
    );
  }

  function finishGesture(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    gestureRef.current = null;
    setDragging(false);
    if (!gesture.horizontal) return;

    setDragOffset(null);
    onOpenChange(
      resolveActiveActionSwipeOpen(
        gesture.startOffset,
        currentOffsetRef.current,
      ),
    );
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 50);
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-swipe-remove-control]")
    ) {
      return;
    }

    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      return;
    }

    if (offset < 0) {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      setDragOffset(null);
    }
  }

  return (
    <div
      data-swipe-action-id={itemId}
      className="relative min-w-0 overflow-hidden rounded-2xl [touch-action:pan-y]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={finishGesture}
      onClickCapture={handleClickCapture}
    >
      <div
        className="absolute inset-y-0 right-0 flex items-stretch justify-end rounded-r-2xl bg-destructive"
        style={{ width: ACTIVE_ACTION_SWIPE_REVEAL_PX }}
      >
        <button
          type="button"
          data-swipe-remove-control
          disabled={removalPending}
          onClick={onRemove}
          aria-label={`${actionLabel} ${itemTitle} ${accessibilityContext}`}
          className="flex min-h-11 w-full flex-col items-center justify-center gap-1.5 px-2 text-sm font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-70"
        >
          {removalPending ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Trash2 className="size-5" />
          )}
          <span>{removalPending ? pendingLabel : actionLabel}</span>
        </button>
      </div>
      <div
        className={`relative z-10 min-w-0 w-full will-change-transform transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none motion-reduce:will-change-auto ${
          dragging ? "transition-none" : ""
        }`}
        style={{
          transform: removing ? "translateX(-110%)" : `translateX(${offset}px)`,
          opacity: removing ? 0 : 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
