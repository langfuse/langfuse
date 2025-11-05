import { getCompactRepresentation } from "./getCompactRepresentation";

export const resolveIOByMode = (
  io: unknown,
  mode: "compact" | "truncated" | "full",
) => {
  if (mode === "compact") {
    const compact = getCompactRepresentation(io);
    if (compact.success) {
      return compact.data;
    }
  }
  return io;
};
