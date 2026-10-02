/**
 * Calculates the exact upcoming execution and posting timestamps in UTC,
 * correctly handling IANA timezones, days of the week, and recurring rules.
 */

export interface ScheduleCalculationSettings {
  timezone?: string | null;
  schedule_type?: string | null;
  post_time?: string | null;
  post_times?: string[] | null;
  post_days?: string[] | null;
  post_day_of_month?: number | string | null;
}

export interface NextAutomationRunResult {
  runAt: Date;
  postAt: Date;
  timeSlot: string;
}

function getUtcDateForLocalTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`;
  const utcDate = new Date(isoStr);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(utcDate);
  const partMap: Record<string, string> = {};
  for (const p of parts) partMap[p.type] = p.value;

  const localAsUtc = new Date(
    Date.UTC(
      Number(partMap.year),
      Number(partMap.month) - 1,
      Number(partMap.day),
      Number(partMap.hour) % 24,
      Number(partMap.minute),
      Number(partMap.second)
    )
  );

  const offset = localAsUtc.getTime() - utcDate.getTime();
  return new Date(utcDate.getTime() - offset);
}

export function calculateNextAutomationRun(
  settings: ScheduleCalculationSettings,
  fromDate: Date = new Date()
): NextAutomationRunResult | null {
  const timeZone = settings.timezone || "UTC";
  const scheduleType = settings.schedule_type || "daily";
  const times =
    settings.post_times && settings.post_times.length > 0
      ? settings.post_times
      : [settings.post_time || "09:00:00"];
  const postDays = (settings.post_days || []).map((d) => d.toLowerCase());
  const postDayOfMonth = Number(settings.post_day_of_month || 1);

  const localFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
  });

  const candidates: NextAutomationRunResult[] = [];

  // Look ahead up to 35 days to find the next active slot
  for (let offset = 0; offset <= 35; offset++) {
    const candidateDay = new Date(fromDate.getTime() + offset * 86_400_000);
    const parts = localFormatter.formatToParts(candidateDay);
    const partMap: Record<string, string> = {};
    for (const p of parts) partMap[p.type] = p.value;

    const year = Number(partMap.year);
    const month = Number(partMap.month);
    const day = Number(partMap.day);
    const weekday = (partMap.weekday || "").toLowerCase();

    let isDayActive = false;
    if (scheduleType === "daily") {
      isDayActive = true;
    } else if (scheduleType === "weekdays") {
      isDayActive = ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(weekday);
    } else if (scheduleType === "weekly") {
      isDayActive = postDays.includes(weekday);
    } else if (scheduleType === "monthly") {
      isDayActive = day === postDayOfMonth;
    }

    if (!isDayActive) continue;

    for (const slot of times) {
      const [hStr, mStr, sStr] = slot.split(":");
      const hour = Number(hStr || 0);
      const minute = Number(mStr || 0);
      const second = Number(sStr || 0);

      const postAt = getUtcDateForLocalTime(year, month, day, hour, minute, second, timeZone);
      // Run generation 10 minutes prior to posting time
      const runAt = new Date(postAt.getTime() - 10 * 60_000);

      // Must be in the future (with a small 2-second buffer)
      if (runAt.getTime() > fromDate.getTime() + 2_000) {
        candidates.push({ runAt, postAt, timeSlot: slot });
      }
    }

    if (candidates.length > 0 && offset >= 1) {
      break;
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
  return candidates[0];
}