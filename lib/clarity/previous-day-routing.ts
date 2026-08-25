export type AuthoritativeReturnState =
  | {
      kind: "quick_recap";
      localDate: string;
      planStatus: "proposed" | "active" | "closing";
      rangeStartDate: string;
      rangeEndDate: string;
      dayCount: 1;
    }
  | {
      kind: "catch_up" | "get_current";
      rangeStartDate: string;
      rangeEndDate: string;
      dayCount: number;
    }
  | {
      kind: "ready_for_today";
      throughDate: string;
    };

export function parseAuthoritativeReturnState(
  value: unknown,
): AuthoritativeReturnState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Return backlog state is invalid.");
  }

  const state = value as Record<string, unknown>;

  if (state.state === "ready_for_today") {
    return {
      kind: "ready_for_today",
      throughDate: readLocalDate(state.throughDate),
    };
  }

  if (state.state === "quick_recap") {
    if (
      state.planStatus !== "proposed" &&
      state.planStatus !== "active" &&
      state.planStatus !== "closing"
    ) {
      throw new Error("Return backlog state is invalid.");
    }

    if (state.dayCount !== 1) {
      throw new Error("Return backlog state is invalid.");
    }

    return {
      kind: "quick_recap",
      localDate: readLocalDate(state.localDate),
      planStatus: state.planStatus,
      rangeStartDate: readLocalDate(state.rangeStartDate),
      rangeEndDate: readLocalDate(state.rangeEndDate),
      dayCount: 1,
    };
  }

  if (state.state === "catch_up" || state.state === "get_current") {
    if (
      typeof state.dayCount !== "number" ||
      !Number.isInteger(state.dayCount) ||
      state.dayCount < 1
    ) {
      throw new Error("Return backlog state is invalid.");
    }

    if (
      (state.state === "catch_up" && state.dayCount > 7) ||
      (state.state === "get_current" && state.dayCount < 8)
    ) {
      throw new Error("Return backlog state is invalid.");
    }

    return {
      kind: state.state,
      rangeStartDate: readLocalDate(state.rangeStartDate),
      rangeEndDate: readLocalDate(state.rangeEndDate),
      dayCount: state.dayCount,
    };
  }

  throw new Error("Return backlog state is invalid.");
}

function readLocalDate(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error("Return backlog state is invalid.");
  }

  return value;
}
