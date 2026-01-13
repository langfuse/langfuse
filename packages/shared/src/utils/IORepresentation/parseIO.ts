import { toCompactVerbosity } from "./toCompactVerbosity";

export const parseIO = (
  io: unknown,
  verbosity: "compact" | "truncated" | "full",
) => {
  if (verbosity === "compact") {
    const compact = toCompactVerbosity(io);
    if (compact.success) {
      return compact.data;
    }
  }
  return io;
};
