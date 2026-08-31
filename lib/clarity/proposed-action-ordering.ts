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

export function proposedActionOrdersMatch(
  left: readonly string[],
  right: readonly string[],
) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}
