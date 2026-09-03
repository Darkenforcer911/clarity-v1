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

export function formatDuration(totalMinutes: number) {
  const safeMinutes = Number.isFinite(totalMinutes)
    ? Math.max(0, Math.trunc(totalMinutes))
    : 0;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return minutes === 0
    ? `${hours}h`
    : `${hours}h ${minutes}m`;
}

export function parseDurationInput(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return { totalMinutes: null, error: null };
  }

  const minutesOnly = normalized.match(/^(\d+)\s*m$/);
  const hoursAndMinutes = normalized.match(/^(\d+)\s*h(?:\s*(\d+)\s*m)?$/);
  let totalMinutes: number | null = null;

  if (minutesOnly) {
    totalMinutes = Number(minutesOnly[1]);
  } else if (hoursAndMinutes) {
    const hours = Number(hoursAndMinutes[1]);
    const minutes = hoursAndMinutes[2] ? Number(hoursAndMinutes[2]) : 0;

    if (minutes <= 59) {
      totalMinutes = hours * 60 + minutes;
    }
  }

  if (
    totalMinutes === null ||
    !Number.isInteger(totalMinutes) ||
    totalMinutes < 1 ||
    totalMinutes > 1440
  ) {
    return {
      totalMinutes: null,
      error: "Use a duration from 1m to 24h, such as 45m or 1h 30m.",
    };
  }

  return { totalMinutes, error: null };
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
