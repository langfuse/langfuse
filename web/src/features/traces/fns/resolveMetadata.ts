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

export const resolveEvaluatorIdMetadata = (
  parsedMetadata: unknown,
): string | null => {
  if (typeof parsedMetadata !== "object" || parsedMetadata === null)
    return null;

  const evaluatorId = (parsedMetadata as Record<string, unknown>).evaluator_id;
  return typeof evaluatorId === "string" && evaluatorId.length > 0
    ? evaluatorId
    : null;
};
