export function splitEstimatedDuration(value: string | number) {
  const parsed = Number(value);
  const totalMinutes =
    Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440
      ? parsed
      : 30;

  return {
    hours: String(Math.floor(totalMinutes / 60)),
    minutes: String(totalMinutes % 60),
  };
}

export function resolveEstimatedDuration(
  hours: string,
  minutes: string,
) {
  if (hours === "" || minutes === "") {
    return {
      totalMinutes: null,
      error: "Enter hours and minutes.",
    };
  }

  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (
    !Number.isInteger(parsedHours) ||
    !Number.isInteger(parsedMinutes) ||
    parsedHours < 0 ||
    parsedMinutes < 0 ||
    parsedMinutes > 59
  ) {
    return {
      totalMinutes: null,
      error: "Use whole hours and 0 to 59 minutes.",
    };
  }

  const totalMinutes = parsedHours * 60 + parsedMinutes;

  if (totalMinutes < 1) {
    return {
      totalMinutes: null,
      error: "Estimated duration must be longer than zero.",
    };
  }

  if (totalMinutes > 1440) {
    return {
      totalMinutes: null,
      error: "Keep this within one day.",
    };
  }

  return { totalMinutes, error: null };
}
