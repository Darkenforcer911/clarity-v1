export function addedActionDestination(planStatus: string) {
  if (planStatus === "proposed") {
    return "/today/plan";
  }

  if (planStatus === "active") {
    return "/today/active";
  }

  return "/today";
}

export function addedActionNoticeDestination(
  planStatus: string,
  scheduledTime: string,
) {
  const destination = addedActionDestination(planStatus);
  const params = new URLSearchParams({ notice: "action-added" });

  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) {
    params.set("time", scheduledTime);
  }

  return `${destination}?${params.toString()}`;
}

export function formatAddedActionNotice(scheduledTime: string | null) {
  if (!scheduledTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) {
    return "Added as flexible";
  }

  const [hourText, minute] = scheduledTime.split(":");
  const hour = Number(hourText);
  const period = hour < 12 ? "am" : "pm";
  const displayHour = hour % 12 || 12;

  return `Added for ${displayHour}:${minute} ${period}`;
}
