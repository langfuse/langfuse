export const parseJsonSafe = (value: string): unknown => {
  if (!value || value.trim() === "") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};
