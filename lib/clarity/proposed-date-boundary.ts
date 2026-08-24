export type ProposedDateBoundary = {
  endedLocalDate: string;
  currentLocalDate: string;
};

export type ProposedDateBoundaryPresentation = {
  heading: string;
  message: string;
  actionLabel: "Return to Today";
  actionHref: "/today";
};

export function getProposedDateBoundary(
  planLocalDate: string,
  currentLocalDate: string,
): ProposedDateBoundary | null {
  if (planLocalDate >= currentLocalDate) return null;

  return {
    endedLocalDate: planLocalDate,
    currentLocalDate,
  };
}

export function getProposedDateBoundaryPresentation(
  boundary: ProposedDateBoundary,
): ProposedDateBoundaryPresentation {
  const endedDay = formatLocalDateWeekday(boundary.endedLocalDate);
  const currentDay = formatLocalDateWeekday(boundary.currentLocalDate);

  return {
    heading: `${endedDay} has ended.`,
    message: `It's now ${currentDay}. Return to Today to finish ${endedDay} and continue.`,
    actionLabel: "Return to Today",
    actionHref: "/today",
  };
}

function formatLocalDateWeekday(localDate: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${localDate}T00:00:00.000Z`));
}
