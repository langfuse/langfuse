/** Returns the price as a number, or null when the input is not a usable price. */
export const parsePriceInput = (raw: string | undefined): number | null => {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
