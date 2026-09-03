"use client";

import { ArrowLeft, MoveRight, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { approvePlanAction } from "@/app/(app)/today/actions";
import {
  removeProposedActionInlineAction,
  reorderProposedActionsInlineAction,
  restoreProposedActionInlineAction,
  restoreRemovedProposedActionsAction,
} from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import type {
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import {
  formatScheduledTime,
  formatWeekday,
  getLocalDate,
} from "@/lib/clarity/date-time";
import {
  canApproveProposedPlan,
  formatProposedPlanSummary,
  shouldClearOpenDayConfirmation,
} from "@/lib/clarity/proposed-plan-summary";
import {
  constrainTimedActionOrder,
  getDraggedRowTop,
  getUntimedActionOrder,
  moveUntimedActionWithinUntimedSlots,
  proposedActionOrdersMatch,
  reconcileProposedActionOrder,
  resolveDiscreteInsertionSlot,
} from "@/lib/clarity/proposed-action-ordering";
import { AddActionForm } from "./add-action-form";
import { PendingButton } from "./pending-button";
import { ProposedActionCard } from "./proposed-action-card";
import { ProposedActionReorderControl } from "./proposed-action-reorder-control";
import { DailyCommitments } from "./daily-commitments";
import type { CalendarCommitment } from "@/lib/clarity/calendar-commitments";
import { partitionShapeTodayItems } from "@/lib/clarity/shape-today-items";
import { SoFarToday } from "./so-far-today";
import { SwipeToRemove } from "./swipe-to-remove";

type ProposedPlanProps = {
  plan: DailyPlan;
  actions: DailyAction[];
  removedActionCount: number;
  profile: Profile;
  initialNow: string;
  commitments: CalendarCommitment[];
};

type ReorderGesture = {
  actionId: string;
  pointerId: number;
  startPointerY: number;
  grabOffsetY: number;
  dragging: boolean;
};

const DRAG_START_THRESHOLD_PX = 8;

export function ProposedPlan({
  plan,
  actions,
  removedActionCount,
  profile,
  initialNow,
  commitments,
}: ProposedPlanProps) {
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [addActionOpen, setAddActionOpen] = useState(false);
  const [keepDayOpen, setKeepDayOpen] = useState(false);
  const [now, setNow] = useState(initialNow);
  const [swipedActionId, setSwipedActionId] = useState<string | null>(null);
  const [locallyRemovedActionIds, setLocallyRemovedActionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [removingActionIds, setRemovingActionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [pendingRemovalIds, setPendingRemovalIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [removalNoticeActionId, setRemovalNoticeActionId] = useState<
    string | null
  >(null);
  const [lastRemovedAction, setLastRemovedAction] = useState<DailyAction | null>(
    null,
  );
  const [optimisticallyRestoredAction, setOptimisticallyRestoredAction] =
    useState<DailyAction | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const initialProposedActions = actions
    .filter((action) => action.status === "proposed")
    .sort((left, right) => left.sort_order - right.sort_order);
  const initialProposedActionOrder = constrainTimedActionOrder(
    initialProposedActions.map((action) => action.id),
    initialProposedActions,
  );
  const [orderedActionIds, setOrderedActionIds] = useState<string[]>(
    initialProposedActionOrder,
  );
  const [orderingPending, setOrderingPending] = useState(false);
  const [orderingError, setOrderingError] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingActionId, setDraggingActionId] = useState<string | null>(null);
  const [reorderRevision, setReorderRevision] = useState(0);
  const orderedActionIdsRef = useRef(initialProposedActionOrder);
  const orderBeforeDragRef = useRef<string[] | null>(null);
  const actionListRef = useRef<HTMLDivElement>(null);
  const actionRowRefs = useRef(new Map<string, HTMLDivElement>());
  const rowPositionsBeforeOrderRef = useRef<Map<string, number> | null>(null);
  const reorderGestureRef = useRef<ReorderGesture | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const dragGrabOffsetYRef = useRef(0);
  const draggedRowOffsetRef = useRef(0);
  const dragSettleFrameRef = useRef(0);
  const dragSettleAnimationRef = useRef<Animation | null>(null);
  const dragSettlingRef = useRef(false);
  const scrollTargetActionIdRef = useRef<string | null>(null);
  const dayName = formatWeekday(plan.local_date);
  const currentLocalDate = getLocalDate(
    profile.timezone,
    new Date(now),
  );
  const completedActions = actions.filter(
    (action) => action.status === "completed",
  );
  const serverRemainingActions = actions.filter(
    (action) => action.status === "proposed",
  );
  const remainingActionMap = new Map(
    serverRemainingActions.map((action) => [action.id, action]),
  );
  if (
    optimisticallyRestoredAction &&
    !remainingActionMap.has(optimisticallyRestoredAction.id)
  ) {
    remainingActionMap.set(
      optimisticallyRestoredAction.id,
      optimisticallyRestoredAction,
    );
  }
  const availableRemainingActions = [...remainingActionMap.values()]
    .filter((action) => !locallyRemovedActionIds.has(action.id))
    .sort((left, right) => left.sort_order - right.sort_order);
  const availableActionIds = availableRemainingActions.map(
    (action) => action.id,
  );
  const displayOrder = constrainTimedActionOrder(
    reconcileProposedActionOrder(orderedActionIds, availableActionIds),
    availableRemainingActions,
  );
  const displayOrderKey = displayOrder.join(",");
  const remainingActionById = new Map(
    availableRemainingActions.map((action) => [action.id, action]),
  );
  const remainingActions = displayOrder
    .map((actionId) => remainingActionById.get(actionId))
    .filter((action): action is DailyAction => Boolean(action));
  const shapeTodayItems = partitionShapeTodayItems({
    actions: remainingActions,
    commitments,
    localDate: plan.local_date,
    timezone: profile.timezone,
    now: new Date(now),
  });
  const {
    earlierActions,
    earlierCommitments,
    fixedActions,
    fixedCommitments,
    flexibleActions: flexibleRemainingActions,
  } = shapeTodayItems;
  const passedActionIds = new Set(earlierActions.map((action) => action.id));
  const hasPassedActions = passedActionIds.size > 0;
  const completedEvidenceActions = completedActions.filter(
    (action) => action.completion_evidence_only,
  );
  const hasSoFarToday =
    completedActions.length > 0 ||
    earlierActions.length > 0 ||
    earlierCommitments.length > 0;
  const totalMinutes = remainingActions.reduce(
    (total, action) => total + action.estimated_minutes,
    0,
  );
  const specificTimeCount = remainingActions.filter(
    (action) =>
      action.action_type === "fixed" &&
      action.scheduled_time !== null &&
      !passedActionIds.has(action.id),
  ).length;
  const planSummary = formatProposedPlanSummary(
    remainingActions.length,
    totalMinutes,
    specificTimeCount,
  );
  const hasRemainingActions = remainingActions.length > 0;
  const canReorderActions = flexibleRemainingActions.length > 1;
  const canRestoreRemovedActions =
    !hasRemainingActions &&
    (removedActionCount > 0 || locallyRemovedActionIds.size > 0);
  const previousRemainingCountRef = useRef(remainingActions.length);
  const router = useRouter();
  const availableActionIdsKey = availableActionIds.join(",");

  const positionDraggedRow = useCallback(
    (actionId: string, pointerY: number) => {
      const row = actionRowRefs.current.get(actionId);
      if (!row) return;

      const bounds = row.getBoundingClientRect();
      const layoutTop = bounds.top - draggedRowOffsetRef.current;
      const desiredTop = getDraggedRowTop(
        pointerY,
        dragGrabOffsetYRef.current,
      );
      const nextOffset = desiredTop - layoutTop;
      dragPointerYRef.current = pointerY;
      draggedRowOffsetRef.current = nextOffset;
      row.style.transform = `translate3d(0, ${nextOffset}px, 0)`;
      row.style.willChange = "transform";
    },
    [],
  );

  useEffect(() => {
    const nextAvailableActionIds = availableActionIdsKey
      ? availableActionIdsKey.split(",")
      : [];

    setOrderedActionIds((currentOrder) => {
      const reconciledOrder = constrainTimedActionOrder(
        reconcileProposedActionOrder(currentOrder, nextAvailableActionIds),
        availableRemainingActions,
      );
      orderedActionIdsRef.current = reconciledOrder;
      return proposedActionOrdersMatch(currentOrder, reconciledOrder)
        ? currentOrder
        : reconciledOrder;
    });
  }, [availableActionIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const previousPositions = rowPositionsBeforeOrderRef.current;
    rowPositionsBeforeOrderRef.current = null;

    if (draggingActionId && dragPointerYRef.current !== null) {
      positionDraggedRow(draggingActionId, dragPointerYRef.current);
    }

    if (!previousPositions || prefersReducedMotion()) return;

    for (const [actionId, element] of actionRowRefs.current) {
      if (actionId === draggingActionId) continue;
      const previousTop = previousPositions.get(actionId);
      if (previousTop === undefined) continue;
      const delta = previousTop - element.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;

      element.animate(
        [
          { transform: `translateY(${delta}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }
  }, [displayOrderKey, draggingActionId, positionDraggedRow]);

  useEffect(() => {
    return () => {
      window.cancelAnimationFrame(dragSettleFrameRef.current);
      const animation = dragSettleAnimationRef.current;
      if (animation) {
        animation.onfinish = null;
        animation.oncancel = null;
        animation.cancel();
      }
    };
  }, []);

  useEffect(() => {
    let timer = 0;

    const refreshNow = () => setNow(new Date().toISOString());
    const scheduleMinuteRefresh = () => {
      const delay = 60_000 - (Date.now() % 60_000) + 50;
      timer = window.setTimeout(() => {
        refreshNow();
        scheduleMinuteRefresh();
      }, delay);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshNow();
      }
    };

    scheduleMinuteRefresh();
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!swipedActionId) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setSwipedActionId(null);
        return;
      }

      const swipedCard = target.closest<HTMLElement>("[data-swipe-action-id]");
      if (swipedCard?.dataset.swipeActionId !== swipedActionId) {
        setSwipedActionId(null);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [swipedActionId]);

  useEffect(() => {
    const previousCount = previousRemainingCountRef.current;
    previousRemainingCountRef.current = remainingActions.length;

    if (
      shouldClearOpenDayConfirmation(
        previousCount,
        remainingActions.length,
      )
    ) {
      const frame = window.requestAnimationFrame(() => {
        setKeepDayOpen(false);
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [remainingActions.length]);

  const handleActionToggle = useCallback((actionId: string) => {
    if (reorderMode) return;
    setSwipedActionId(null);
    setExpandedActionId((currentActionId) => {
      const nextActionId = currentActionId === actionId ? null : actionId;
      scrollTargetActionIdRef.current = nextActionId;
      return nextActionId;
    });
  }, [reorderMode]);

  const handleActionCollapse = useCallback((actionId: string) => {
    setExpandedActionId((currentActionId) =>
      currentActionId === actionId ? null : currentActionId,
    );
  }, []);

  function applyLocalOrder(nextOrder: string[]) {
    const constrainedOrder = constrainTimedActionOrder(
      nextOrder,
      availableRemainingActions,
    );
    orderedActionIdsRef.current = constrainedOrder;
    setOrderedActionIds(constrainedOrder);
  }

  function captureRowPositions() {
    rowPositionsBeforeOrderRef.current = new Map(
      [...actionRowRefs.current].map(([actionId, element]) => [
        actionId,
        element.getBoundingClientRect().top,
      ]),
    );
  }

  async function persistOrder(previousOrder: string[], nextOrder: string[]) {
    if (proposedActionOrdersMatch(previousOrder, nextOrder)) return;

    setOrderingPending(true);
    setOrderingError(null);
    const result = await reorderProposedActionsInlineAction(
      plan.id,
      nextOrder,
    );
    setOrderingPending(false);

    if (!result.success) {
      captureRowPositions();
      applyLocalOrder(previousOrder);
      setOrderingError(
        result.error ?? "Couldn’t save the new order. Try again.",
      );
    }
  }

  function enterReorderMode() {
    flushSync(() => {
      setExpandedActionId(null);
      setSwipedActionId(null);
      setOrderingError(null);
      setReorderRevision((current) => current + 1);
      setReorderMode(true);
    });
  }

  function exitReorderMode() {
    if (draggingActionId || orderingPending) return;
    setExpandedActionId(null);
    setSwipedActionId(null);
    setReorderRevision((current) => current + 1);
    setReorderMode(false);
  }

  function handleReorderPointerDown(
    action: DailyAction,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (
      !reorderMode ||
      orderingPending ||
      dragSettlingRef.current ||
      action.scheduled_time !== null ||
      event.button !== 0
    ) {
      return;
    }

    event.stopPropagation();
    const row = actionRowRefs.current.get(action.id);
    if (!row) return;
    const bounds = row.getBoundingClientRect();
    const grabOffsetY = event.clientY - bounds.top;
    reorderGestureRef.current = {
      actionId: action.id,
      pointerId: event.pointerId,
      startPointerY: event.clientY,
      grabOffsetY,
      dragging: false,
    };
    dragGrabOffsetYRef.current = grabOffsetY;
  }

  function handleReorderPointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const gesture = reorderGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (
      !gesture.dragging &&
      Math.abs(event.clientY - gesture.startPointerY) <
        DRAG_START_THRESHOLD_PX
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (!gesture.dragging) {
      gesture.dragging = true;
      beginDragOrder(gesture.actionId, event.clientY);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    previewDragOrder(gesture.actionId, event.clientY);
  }

  function finishReorderPointer(
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled: boolean,
  ) {
    const gesture = reorderGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    reorderGestureRef.current = null;
    if (gesture.dragging) {
      finishDragOrder(gesture.actionId, cancelled);
    }
  }

  function beginDragOrder(actionId: string, pointerY: number) {
    const currentOrder = constrainTimedActionOrder(
      reconcileProposedActionOrder(
        orderedActionIdsRef.current,
        availableActionIds,
      ),
      availableRemainingActions,
    );
    orderBeforeDragRef.current = [...currentOrder];
    dragPointerYRef.current = pointerY;
    draggedRowOffsetRef.current = 0;
    flushSync(() => {
      setExpandedActionId(null);
      setSwipedActionId(null);
      setOrderingError(null);
      setDraggingActionId(actionId);
    });
    positionDraggedRow(actionId, pointerY);
  }

  function previewDragOrder(actionId: string, pointerY: number) {
    positionDraggedRow(actionId, pointerY);

    const currentOrder = orderedActionIdsRef.current;
    const currentFlexibleOrder = getUntimedActionOrder(
      currentOrder,
      availableRemainingActions,
    );
    const currentSlot = currentFlexibleOrder.indexOf(actionId);
    if (currentSlot < 0) return;

    const validSlots = currentFlexibleOrder.map((_, index) => index);
    const rowMidpoints = currentFlexibleOrder.flatMap((orderedActionId) => {
      const row = actionRowRefs.current.get(orderedActionId);
      if (!row) return [];
      const bounds = row.getBoundingClientRect();
      return [
        {
          actionId: orderedActionId,
          midpointY: bounds.top + bounds.height / 2,
        },
      ];
    });
    const draggedRow = actionRowRefs.current.get(actionId);
    if (!draggedRow) return;
    const draggedTop = getDraggedRowTop(
      pointerY,
      dragGrabOffsetYRef.current,
    );
    const targetIndex = resolveDiscreteInsertionSlot({
      currentSlot,
      draggedActionId: actionId,
      draggedCenterY:
        draggedTop + draggedRow.getBoundingClientRect().height / 2,
      rowMidpoints,
      validSlots,
    });

    const nextOrder = moveUntimedActionWithinUntimedSlots(
      currentOrder,
      actionId,
      targetIndex,
      availableRemainingActions,
    );
    if (proposedActionOrdersMatch(orderedActionIdsRef.current, nextOrder)) {
      return;
    }

    captureRowPositions();
    applyLocalOrder(nextOrder);
  }

  function finishDragOrder(actionId: string, cancelled: boolean) {
    if (dragSettlingRef.current) return;

    const previousOrder = orderBeforeDragRef.current;
    const nextOrder = [...orderedActionIdsRef.current];
    orderBeforeDragRef.current = null;

    if (!previousOrder) {
      completeDragCleanup(actionId);
      return;
    }

    if (cancelled) {
      captureRowPositions();
      applyLocalOrder(previousOrder);
    }

    dragSettlingRef.current = true;
    snapDraggedRowToSlot(actionId, () => {
      dragSettlingRef.current = false;
      completeDragCleanup(actionId);
      if (!cancelled) {
        void persistOrder(previousOrder, nextOrder);
      }
    });
  }

  function moveActionByStep(actionId: string, direction: -1 | 1) {
    if (orderingPending) return;

    const previousOrder = reconcileProposedActionOrder(
      orderedActionIdsRef.current,
      availableActionIds,
    );
    const currentFlexibleOrder = getUntimedActionOrder(
      previousOrder,
      availableRemainingActions,
    );
    const currentFlexibleIndex = currentFlexibleOrder.indexOf(actionId);
    const nextOrder = moveUntimedActionWithinUntimedSlots(
      previousOrder,
      actionId,
      currentFlexibleIndex + direction,
      availableRemainingActions,
    );

    captureRowPositions();
    applyLocalOrder(nextOrder);
    void persistOrder(previousOrder, nextOrder);
  }

  function completeDragCleanup(actionId: string) {
    const row = actionRowRefs.current.get(actionId);
    if (row) {
      row.style.transform = "";
      row.style.willChange = "";
    }
    dragPointerYRef.current = null;
    dragGrabOffsetYRef.current = 0;
    draggedRowOffsetRef.current = 0;
    setExpandedActionId(null);
    setDraggingActionId(null);
    setReorderRevision((current) => current + 1);
  }

  function snapDraggedRowToSlot(actionId: string, onSettled: () => void) {
    window.cancelAnimationFrame(dragSettleFrameRef.current);
    dragSettleFrameRef.current = window.requestAnimationFrame(() => {
      const row = actionRowRefs.current.get(actionId);
      if (!row) {
        onSettled();
        return;
      }

      if (prefersReducedMotion()) {
        row.style.transform = "";
        row.style.willChange = "";
        onSettled();
        return;
      }

      const currentTransform = window.getComputedStyle(row).transform;
      const animation = row.animate(
        [
          { transform: currentTransform },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 120,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
          fill: "forwards",
        },
      );
      dragSettleAnimationRef.current = animation;
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        animation.onfinish = null;
        animation.oncancel = null;
        row.style.transform = "";
        row.style.willChange = "";
        animation.cancel();
        dragSettleAnimationRef.current = null;
        onSettled();
      };
      animation.onfinish = finish;
      animation.oncancel = finish;
    });
  }

  async function handleRestoreRemovedActions(formData: FormData) {
    await restoreRemovedProposedActionsAction(formData);
    setKeepDayOpen(false);
    setExpandedActionId(null);
    setSwipedActionId(null);
    setLocallyRemovedActionIds(new Set());
    setRemovalNoticeActionId(null);
    setLastRemovedAction(null);
    setOptimisticallyRestoredAction(null);
  }

  async function removeAction(actionId: string) {
    const action = remainingActions.find((candidate) => candidate.id === actionId);
    if (!action) return;

    setRemovalError(null);
    setPendingRemovalIds((current) => new Set(current).add(actionId));
    const result = await removeProposedActionInlineAction(actionId);
    setPendingRemovalIds((current) => {
      const next = new Set(current);
      next.delete(actionId);
      return next;
    });

    if (!result.success) {
      setSwipedActionId(null);
      setRemovalError(result.error ?? "Couldn’t remove the action. Try again.");
      return;
    }

    setExpandedActionId((current) => (current === actionId ? null : current));
    setRemovingActionIds((current) => new Set(current).add(actionId));
    setSwipedActionId(null);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 190;
    window.setTimeout(() => {
      setLocallyRemovedActionIds((current) => new Set(current).add(actionId));
      setRemovingActionIds((current) => {
        const next = new Set(current);
        next.delete(actionId);
        return next;
      });
      setLastRemovedAction(action);
      setOptimisticallyRestoredAction(null);
      setRemovalNoticeActionId(actionId);
      setKeepDayOpen(false);
    }, delay);
  }

  async function undoRemoval() {
    if (!removalNoticeActionId || undoPending) return;

    const actionId = removalNoticeActionId;
    setUndoPending(true);
    setRemovalError(null);
    const result = await restoreProposedActionInlineAction(actionId);
    setUndoPending(false);

    if (!result.success) {
      setRemovalError(result.error ?? "Couldn’t restore the action. Try again.");
      return;
    }

    setLocallyRemovedActionIds((current) => {
      const next = new Set(current);
      next.delete(actionId);
      return next;
    });
    if (lastRemovedAction?.id === actionId) {
      setOptimisticallyRestoredAction(lastRemovedAction);
    }
    setRemovalNoticeActionId(null);
    setLastRemovedAction(null);
    setExpandedActionId(null);
    router.refresh();
  }

  useEffect(() => {
    if (
      !expandedActionId ||
      scrollTargetActionIdRef.current !== expandedActionId
    ) {
      return;
    }

    let frame = 0;
    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(() => {
        const card = actionListRef.current?.querySelector<HTMLElement>(
          `[data-proposed-action-id="${expandedActionId}"], [data-fixed-daily-action-id="${expandedActionId}"]`,
        );
        const header = card?.querySelector<HTMLElement>(
          "[data-proposed-action-header]",
        );

        if (!header) {
          return;
        }

        const headerBounds = header.getBoundingClientRect();
        const navigation = document.querySelector<HTMLElement>(
          'nav[aria-label="Primary"]',
        );
        const viewportTop = 12;
        const viewportBottom = Math.min(
          window.innerHeight,
          navigation?.getBoundingClientRect().top ?? window.innerHeight,
        ) - 12;
        let adjustment = 0;

        if (headerBounds.top < viewportTop) {
          adjustment = headerBounds.top - viewportTop;
        } else if (headerBounds.bottom > viewportBottom) {
          adjustment = headerBounds.bottom - viewportBottom;
        }

        if (Math.abs(adjustment) > 1) {
          const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;

          window.scrollBy({
            top: adjustment,
            behavior: reduceMotion ? "auto" : "smooth",
          });
        }

        scrollTargetActionIdRef.current = null;
      });
    }, 210);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [expandedActionId]);

  function renderTimedAction(action: DailyAction) {
    return (
      <SwipeToRemove
        itemId={action.id}
        itemTitle={action.title}
        open={swipedActionId === action.id}
        onOpenChange={(open) => setSwipedActionId(open ? action.id : null)}
        onRemove={() => removeAction(action.id)}
        removalPending={pendingRemovalIds.has(action.id)}
        removing={removingActionIds.has(action.id)}
        enabled={!reorderMode}
        accessibilityContext="from the proposed plan"
      >
        <div data-fixed-daily-action-id={action.id}>
          <ProposedActionCard
            action={action}
            scheduledTime={formatScheduledTime(
              action.scheduled_time,
              profile.timezone,
            )}
            scheduledTimeInput={formatTimeInput(
              action.scheduled_time,
              profile.timezone,
            )}
            timePassed={passedActionIds.has(action.id)}
            expanded={!reorderMode && expandedActionId === action.id}
            onToggle={handleActionToggle}
            onCollapse={handleActionCollapse}
            onRemove={removeAction}
            reorderControl={null}
            reordering={reorderMode}
            planLocalDate={plan.local_date}
            currentLocalDate={currentLocalDate}
          />
        </div>
      </SwipeToRemove>
    );
  }

  return (
    <section className="w-full min-w-0 max-w-full space-y-8">
      <div ref={actionListRef} className="min-w-0 space-y-8">
        <div className="space-y-3">
          <Link
            href="/today"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-[-0.045em]">
            {hasSoFarToday ? `Plan the rest of ${dayName}` : `Plan ${dayName}`}
          </h1>
          <p className="max-w-xl leading-7 text-muted-foreground">
            {hasSoFarToday
              ? "Record what has already happened, then review what remains."
              : "Review and adjust today's actions before you begin."}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">{planSummary}</p>

        {removalNoticeActionId && (
          <div
            role="status"
            className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-secondary px-3 py-1.5 text-sm"
          >
            <span className="font-medium text-foreground">
              Removed from {dayName}
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={undoPending}
              onClick={undoRemoval}
              className="h-9 px-2 text-[var(--clarity-completed)]"
            >
              {undoPending ? "Restoring…" : "Undo"}
            </Button>
            {removalError && (
              <span role="alert" className="basis-full pb-1 text-xs text-destructive">
                {removalError}
              </span>
            )}
          </div>
        )}
        {removalError && !removalNoticeActionId && (
          <p role="alert" className="text-sm text-destructive">
            {removalError}
          </p>
        )}
        {orderingError && (
          <p role="alert" className="text-sm text-destructive">
            {orderingError}
          </p>
        )}

        <DailyCommitments
          heading="Earlier today"
          commitments={earlierCommitments}
          actions={earlierActions}
          renderAction={renderTimedAction}
          needsOutcome
          timezone={profile.timezone}
          now={new Date(now)}
        />

        <DailyCommitments
          heading="Fixed today"
          commitments={fixedCommitments}
          actions={fixedActions}
          renderAction={renderTimedAction}
          timezone={profile.timezone}
          now={new Date(now)}
        />

        <SoFarToday
          planId={plan.id}
          timezone={profile.timezone}
          completedActions={completedEvidenceActions}
        />

        {flexibleRemainingActions.length > 0 && (
          <div className="space-y-3">
            <div className="flex min-h-10 items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Actions
              </h2>
              {(canReorderActions || reorderMode) && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={Boolean(draggingActionId) || orderingPending}
                  onClick={reorderMode ? exitReorderMode : enterReorderMode}
                  className="h-10 w-auto px-3 text-muted-foreground"
                >
                  {reorderMode ? "Done" : "Reorder"}
                </Button>
              )}
            </div>

            <div
              data-proposed-action-list
              data-reorder-mode={reorderMode ? "true" : "false"}
              className="min-w-0 space-y-4"
            >
              {flexibleRemainingActions.map((action, actionIndex) => {
                const movable = reorderMode && action.scheduled_time === null;
                const dragging = draggingActionId === action.id;
                return (
                  <div
                    key={action.id}
                    ref={(element) => {
                      if (element) {
                        actionRowRefs.current.set(action.id, element);
                      } else {
                        actionRowRefs.current.delete(action.id);
                      }
                    }}
                    data-proposed-action-id={action.id}
                    data-proposed-action-index={actionIndex}
                    data-dragging-action={dragging ? "true" : undefined}
                    data-reorder-eligible={movable ? "true" : "false"}
                    aria-grabbed={movable ? dragging : undefined}
                    className={`relative rounded-2xl ${
                      dragging
                        ? "z-40 cursor-grabbing shadow-xl ring-1 ring-primary/50"
                        : ""
                    }`}
                  >
                    <SwipeToRemove
                      itemId={action.id}
                      itemTitle={action.title}
                      open={swipedActionId === action.id}
                      onOpenChange={(open) =>
                        setSwipedActionId(open ? action.id : null)
                      }
                      onRemove={() => removeAction(action.id)}
                      removalPending={pendingRemovalIds.has(action.id)}
                      removing={removingActionIds.has(action.id)}
                      enabled={!reorderMode}
                      accessibilityContext="from the proposed plan"
                    >
                      <ProposedActionCard
                        key={`${action.id}:${reorderRevision}`}
                        action={action}
                        scheduledTime={formatScheduledTime(
                          action.scheduled_time,
                          profile.timezone,
                        )}
                        scheduledTimeInput={formatTimeInput(
                          action.scheduled_time,
                          profile.timezone,
                        )}
                        timePassed={passedActionIds.has(action.id)}
                        expanded={
                          !reorderMode && expandedActionId === action.id
                        }
                        onToggle={handleActionToggle}
                        onCollapse={handleActionCollapse}
                        onRemove={removeAction}
                        reorderControl={
                          movable ? (
                            <ProposedActionReorderControl
                              actionTitle={action.title}
                              disabled={orderingPending}
                              canMoveUp={actionIndex > 0}
                              canMoveDown={
                                actionIndex <
                                flexibleRemainingActions.length - 1
                              }
                              onMoveStep={(direction) =>
                                moveActionByStep(action.id, direction)
                              }
                              onPointerDown={(event) =>
                                handleReorderPointerDown(action, event)
                              }
                              onPointerMove={handleReorderPointerMove}
                              onPointerUp={(event) =>
                                finishReorderPointer(event, false)
                              }
                              onPointerCancel={(event) =>
                                finishReorderPointer(event, true)
                              }
                            />
                          ) : null
                        }
                        reordering={reorderMode}
                        planLocalDate={plan.local_date}
                        currentLocalDate={currentLocalDate}
                      />
                    </SwipeToRemove>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!hasRemainingActions && (
          <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">
                No actions planned for {dayName}.
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Add something important, or start the day without planned
                actions.
              </p>
            </div>

            {!addActionOpen && (
              <div className="grid gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddActionOpen(true)}
                  className="h-11 rounded-xl"
                >
                  <Plus />
                  Add action
                </Button>
                {canRestoreRemovedActions && (
                  <form action={handleRestoreRemovedActions}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <PendingButton
                      type="submit"
                      variant="outline"
                      pendingLabel="Restoring…"
                      className="h-11 w-full rounded-xl"
                    >
                      <RotateCcw />
                      Restore removed actions
                    </PendingButton>
                  </form>
                )}
                {!keepDayOpen && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setKeepDayOpen(true)}
                    className="h-11 rounded-xl text-muted-foreground"
                  >
                    Skip planning today
                  </Button>
                )}
              </div>
            )}

            {keepDayOpen && (
              <p
                role="status"
                className="text-sm leading-6 text-[var(--clarity-completed)]"
              >
                {dayName} will begin with no planned actions. You can add
                actions anytime.
              </p>
            )}
          </div>
        )}

        <AddActionForm
          planId={plan.id}
          proposed
          open={addActionOpen}
          onOpenChange={setAddActionOpen}
          hideTrigger={!hasRemainingActions}
          onActionSaved={() => setKeepDayOpen(false)}
        />
      </div>

      <div className="w-full min-w-0 max-w-full rounded-2xl bg-background py-2">
        {hasPassedActions && (
          <p className="mb-3 text-center text-sm leading-6 text-muted-foreground">
            Resolve earlier Actions before beginning.
          </p>
        )}
        <form action={approvePlanAction}>
          <input type="hidden" name="planId" value={plan.id} />
          <input
            type="hidden"
            name="allowEmptyPlan"
            value={String(!hasRemainingActions && keepDayOpen)}
          />
          <PendingButton
            type="submit"
            size="lg"
            disabled={
              hasPassedActions ||
              orderingPending ||
              !canApproveProposedPlan(
                remainingActions.length,
                keepDayOpen,
              )
            }
            pendingLabel="Approving plan…"
            className="h-12 w-full rounded-xl text-base"
          >
            {!hasRemainingActions && keepDayOpen
              ? `Start ${dayName}`
              : "Approve plan"}
            <MoveRight />
          </PendingButton>
        </form>
      </div>
    </section>
  );
}

function formatTimeInput(value: string | null, timezone: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
