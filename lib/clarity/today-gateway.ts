export type TodayGatewayPlanStatus =
  | "unshaped"
  | "proposed"
  | "active"
  | "closing"
  | "closed"
  | null;

export type TodayGatewayPrimaryAction =
  | {
      kind: "start";
      label: string;
      heading: string;
      supportingText: string;
    }
  | {
      kind: "link";
      label: string;
      href: string;
      heading: string;
      supportingText: string;
    };

export function resolveTodayGatewayPrimaryAction({
  currentDay,
  unresolvedApprovedDay,
  hasPendingReturnGap,
  planStatus,
}: {
  currentDay: string;
  unresolvedApprovedDay: string | null;
  hasPendingReturnGap: boolean;
  planStatus: TodayGatewayPlanStatus;
}): TodayGatewayPrimaryAction {
  if (unresolvedApprovedDay) {
    return {
      kind: "link",
      label: `Finish ${unresolvedApprovedDay}`,
      href: "/today/catch-up",
      heading: `${unresolvedApprovedDay} needs a quick recap.`,
      supportingText: "Capture what happened before moving into today.",
    };
  }

  if (hasPendingReturnGap) {
    return {
      kind: "link",
      label: "Catch up",
      href: "/today/catch-up/gap",
      heading: "Let's catch up.",
      supportingText: "Add anything important from the days you missed.",
    };
  }

  switch (planStatus) {
    case null:
    case "unshaped":
      return {
        kind: "start",
        label: `Start ${currentDay}`,
        heading: `${currentDay} hasn't started yet.`,
        supportingText: "Start when you're ready to shape the day.",
      };
    case "proposed":
      return {
        kind: "link",
        label: `Continue shaping ${currentDay}`,
        href: "/today/plan",
        heading: `Your ${currentDay} plan is ready.`,
        supportingText: "Review the proposed actions before beginning.",
      };
    case "active":
      return {
        kind: "link",
        label: `Continue ${currentDay}`,
        href: "/today/active",
        heading: `${currentDay} is underway.`,
        supportingText: "Pick up where you left off with today's actions.",
      };
    case "closing":
      return {
        kind: "link",
        label: `Finish closing ${currentDay}`,
        href: "/today/close",
        heading: `Ready to wrap up ${currentDay}?`,
        supportingText: "Finish recording what happened today.",
      };
    case "closed":
      return {
        kind: "link",
        label: `View ${currentDay} summary`,
        href: "/today/summary",
        heading: `${currentDay} is complete.`,
        supportingText: "Review what was completed and what changed.",
      };
  }
}
