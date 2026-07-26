const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string) {
  const cached = dateFormatterCache.get(timeZone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  dateFormatterCache.set(timeZone, formatter);
  return formatter;
}

function partsFor(date: Date, timeZone: string) {
  const parts = getPartsFormatter(timeZone).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function getLocalDate(timeZone: string, date = new Date()) {
  const parts = partsFor(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

export function addLocalDays(localDate: string, days: number) {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function localDateTimeToIso(
  localDate: string,
  localTime: string,
  timeZone: string,
) {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const expected = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = expected;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = partsFor(new Date(candidate), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const difference = expected - actualAsUtc;

    candidate += difference;

    if (difference === 0) {
      break;
    }
  }

  const resolved = partsFor(new Date(candidate), timeZone);

  if (
    resolved.year !== year ||
    resolved.month !== month ||
    resolved.day !== day ||
    resolved.hour !== hour ||
    resolved.minute !== minute
  ) {
    throw new Error("That local time does not exist in the selected timezone.");
  }

  return new Date(candidate).toISOString();
}

export function resolveShapeTimes(
  localDate: string,
  wokeAt: string,
  aimingToSleepAt: string,
  timeZone: string,
) {
  const wokeMinutes = minutesSinceMidnight(wokeAt);
  const sleepMinutes = minutesSinceMidnight(aimingToSleepAt);
  const sleepDate =
    sleepMinutes <= wokeMinutes ? addLocalDays(localDate, 1) : localDate;

  return {
    wokeAt: localDateTimeToIso(localDate, wokeAt, timeZone),
    aimingToSleepAt: localDateTimeToIso(
      sleepDate,
      aimingToSleepAt,
      timeZone,
    ),
  };
}

export function getGreeting(timeZone: string, name: string | null) {
  const hour = partsFor(new Date(), timeZone).hour;
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return name ? `${greeting}, ${name}` : greeting;
}

export function formatFullLocalDate(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatWeekday(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatScheduledTime(
  value: string | null,
  timeZone: string,
) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function minutesSinceMidnight(localTime: string) {
  const [hour, minute] = localTime.split(":").map(Number);
  return hour * 60 + minute;
}
