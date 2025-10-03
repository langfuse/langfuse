// check if object (not array nor null)
export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null && !Array.isArray(val);
