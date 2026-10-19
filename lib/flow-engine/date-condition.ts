export const DEFAULT_CONDITION_TIMEZONE = "America/Sao_Paulo";

export interface DateCondition {
  operator: string;
  value: string;
  timezone?: string;
}

export function evaluateDateCondition(condition: DateCondition, now = new Date()): boolean {
  // datetime-local values always describe São Paulo wall-clock time.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(condition.value)) return false;
  const expected = condition.value.length === 16 ? `${condition.value}:00` : condition.value;
  const parsed = new Date(`${expected}Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== expected) return false;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_CONDITION_TIMEZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const actual = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
    if (condition.operator === "after") return actual > expected;
    if (condition.operator === "before") return actual < expected;
    return false;
  } catch {
    return false;
  }
}
