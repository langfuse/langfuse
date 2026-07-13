export const resolveEvalExecutionMetadata = (
  parsedMetadata: unknown,
): string | null => {
  try {
    if (typeof parsedMetadata !== "object" || parsedMetadata === null)
      return null;
    return (parsedMetadata as Record<string, unknown>)[
      "target_trace_id"
    ] as string;
  } catch {
    return null;
  }
};
