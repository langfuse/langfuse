/** ExpiryPreset is a selectable key-lifetime option; `custom` defers to a picked date. */
export type ExpiryPreset = "never" | "30d" | "60d" | "90d" | "1y" | "custom";

/** expiryPresetOptions lists the lifetime presets in display order; `days` is null when the choice carries no fixed offset. */
export const expiryPresetOptions: {
  value: ExpiryPreset;
  label: string;
  days: number | null;
}[] = [
  { value: "never", label: "No expiration", days: null },
  { value: "30d", label: "30 days", days: 30 },
  { value: "60d", label: "60 days", days: 60 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "1y", label: "1 year", days: 365 },
  { value: "custom", label: "Custom date…", days: null },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** resolveExpiresAt turns an expiry preset into an absolute date, null when the key never expires, or undefined when the custom date is missing, invalid, or not in the future. */
export const resolveExpiresAt = (
  preset: ExpiryPreset,
  customDate: string,
  now: Date = new Date(),
): Date | null | undefined => {
  if (preset === "custom") return parseCustomExpiry(customDate, now);
  const days =
    expiryPresetOptions.find((o) => o.value === preset)?.days ?? null;
  if (days === null) return null;
  return new Date(now.getTime() + days * MS_PER_DAY);
};

/** localDateInputValue formats a date as the local `yyyy-mm-dd` value a date input expects. */
export const localDateInputValue = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

/** parseCustomExpiry resolves a `yyyy-mm-dd` value to the end of that local day, or undefined unless it is a real date after now. */
const parseCustomExpiry = (customDate: string, now: Date): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customDate);
  if (!match) return undefined;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
  const isRealDate =
    endOfDay.getMonth() === month - 1 && endOfDay.getDate() === day;
  return isRealDate && endOfDay > now ? endOfDay : undefined;
};
