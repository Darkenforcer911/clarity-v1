export function reconcileProposedActionOrder(
  currentOrder: readonly string[],
  availableActionIds: readonly string[],
) {
  const available = new Set(availableActionIds);
  const retained = currentOrder.filter((id) => available.has(id));
  const retainedSet = new Set(retained);

  return [
    ...retained,
    ...availableActionIds.filter((id) => !retainedSet.has(id)),
  ];
}

export function moveProposedActionToIndex(
  currentOrder: readonly string[],
  actionId: string,
  targetIndex: number,
) {
  const sourceIndex = currentOrder.indexOf(actionId);
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= currentOrder.length ||
    sourceIndex === targetIndex
  ) {
    return [...currentOrder];
  }

  const nextOrder = [...currentOrder];
  const [movedId] = nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, movedId);
  return nextOrder;
}

export function moveProposedActionByStep(
  currentOrder: readonly string[],
  actionId: string,
  direction: -1 | 1,
) {
  const sourceIndex = currentOrder.indexOf(actionId);
  if (sourceIndex < 0) {
    return [...currentOrder];
  }

  return moveProposedActionToIndex(
    currentOrder,
    actionId,
    sourceIndex + direction,
  );
}

export type ProposedOrderAction = {
  id: string;
  scheduled_time: string | null;
};

export type ProposedActionRowMidpoint = {
  actionId: string;
  midpointY: number;
};

export function constrainTimedActionOrder(
  currentOrder: readonly string[],
  actions: readonly ProposedOrderAction[],
) {
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const timedActionIds = currentOrder
    .filter((id) => isTimedAction(actionsById.get(id)))
    .sort((leftId, rightId) => {
      const leftTime = scheduledTimeValue(actionsById.get(leftId));
      const rightTime = scheduledTimeValue(actionsById.get(rightId));
      return leftTime - rightTime || leftId.localeCompare(rightId);
    });
  let timedIndex = 0;

  return currentOrder.map((id) =>
    isTimedAction(actionsById.get(id))
      ? timedActionIds[timedIndex++]
      : id,
  );
}

export function moveUntimedActionToIndex(
  currentOrder: readonly string[],
  actionId: string,
  targetIndex: number,
  actions: readonly ProposedOrderAction[],
) {
  const action = actions.find((candidate) => candidate.id === actionId);
  if (isTimedAction(action)) {
    return constrainTimedActionOrder(currentOrder, actions);
  }

  return constrainTimedActionOrder(
    moveProposedActionToIndex(currentOrder, actionId, targetIndex),
    actions,
  );
}

export function moveUntimedActionByStep(
  currentOrder: readonly string[],
  actionId: string,
  direction: -1 | 1,
  actions: readonly ProposedOrderAction[],
) {
  const sourceIndex = currentOrder.indexOf(actionId);
  if (sourceIndex < 0) return constrainTimedActionOrder(currentOrder, actions);

  return moveUntimedActionToIndex(
    currentOrder,
    actionId,
    sourceIndex + direction,
    actions,
  );
}

export function getUntimedActionOrder(
  currentOrder: readonly string[],
  actions: readonly ProposedOrderAction[],
) {
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  return currentOrder.filter((id) => !isTimedAction(actionsById.get(id)));
}

export function moveUntimedActionWithinUntimedSlots(
  currentOrder: readonly string[],
  actionId: string,
  targetUntimedIndex: number,
  actions: readonly ProposedOrderAction[],
) {
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  if (isTimedAction(actionsById.get(actionId))) {
    return constrainTimedActionOrder(currentOrder, actions);
  }

  const canonicalOrder = constrainTimedActionOrder(currentOrder, actions);
  const untimedOrder = getUntimedActionOrder(canonicalOrder, actions);
  const reorderedUntimed = moveProposedActionToIndex(
    untimedOrder,
    actionId,
    targetUntimedIndex,
  );
  let untimedIndex = 0;

  return canonicalOrder.map((id) =>
    isTimedAction(actionsById.get(id))
      ? id
      : reorderedUntimed[untimedIndex++],
  );
}

export function getValidUntimedInsertionSlots(
  currentOrder: readonly string[],
  actionId: string,
  actions: readonly ProposedOrderAction[],
) {
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  if (!actionsById.has(actionId)) return [];
  if (isTimedAction(actionsById.get(actionId))) return [];

  const canonicalOrder = constrainTimedActionOrder(currentOrder, actions);
  const canonicalTimedOrder = canonicalOrder.filter((id) =>
    isTimedAction(actionsById.get(id)),
  );

  return canonicalOrder.flatMap((_, insertionIndex) => {
    const candidate = moveProposedActionToIndex(
      canonicalOrder,
      actionId,
      insertionIndex,
    );
    const candidateTimedOrder = candidate.filter((id) =>
      isTimedAction(actionsById.get(id)),
    );

    return proposedActionOrdersMatch(
      candidateTimedOrder,
      canonicalTimedOrder,
    )
      ? [insertionIndex]
      : [];
  });
}

export function resolveDiscreteInsertionSlot({
  currentSlot,
  draggedActionId,
  draggedCenterY,
  rowMidpoints,
  validSlots,
  hysteresisPx = 8,
}: {
  currentSlot: number;
  draggedActionId: string;
  draggedCenterY: number;
  rowMidpoints: readonly ProposedActionRowMidpoint[];
  validSlots: readonly number[];
  hysteresisPx?: number;
}) {
  if (validSlots.length === 0 || !Number.isFinite(draggedCenterY)) {
    return currentSlot;
  }

  const otherRows = rowMidpoints.filter(
    (row) => row.actionId !== draggedActionId,
  );
  const rawSlot = otherRows.filter(
    (row) => draggedCenterY > row.midpointY,
  ).length;
  const targetSlot = nearestValidSlot(rawSlot, validSlots, currentSlot);

  if (targetSlot > currentSlot) {
    const nextBoundary = otherRows[currentSlot]?.midpointY;
    if (
      nextBoundary !== undefined &&
      draggedCenterY < nextBoundary + hysteresisPx
    ) {
      return currentSlot;
    }
  }

  if (targetSlot < currentSlot) {
    const previousBoundary = otherRows[currentSlot - 1]?.midpointY;
    if (
      previousBoundary !== undefined &&
      draggedCenterY > previousBoundary - hysteresisPx
    ) {
      return currentSlot;
    }
  }

  return targetSlot;
}

export function getDraggedRowTop(pointerY: number, grabOffsetY: number) {
  return pointerY - grabOffsetY;
}

export function proposedActionOrdersMatch(
  left: readonly string[],
  right: readonly string[],
) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function isTimedAction(action: ProposedOrderAction | undefined) {
  return scheduledTimeValue(action) !== Number.POSITIVE_INFINITY;
}

function nearestValidSlot(
  requestedSlot: number,
  validSlots: readonly number[],
  currentSlot: number,
) {
  return validSlots.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(nearest - requestedSlot);
    const candidateDistance = Math.abs(candidate - requestedSlot);

    if (candidateDistance < nearestDistance) return candidate;
    if (candidateDistance > nearestDistance) return nearest;
    if (candidate === currentSlot) return candidate;
    return nearest;
  }, validSlots[0]);
}

function scheduledTimeValue(action: ProposedOrderAction | undefined) {
  if (!action?.scheduled_time) return Number.POSITIVE_INFINITY;
  const value = new Date(action.scheduled_time).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}
