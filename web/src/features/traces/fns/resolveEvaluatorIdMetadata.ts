export function resolveEvaluatorIdMetadata(metadata: unknown): string | null {
  let parsedMetadata = metadata;

  if (typeof parsedMetadata === "string") {
    try {
      parsedMetadata = JSON.parse(parsedMetadata);
    } catch {
      return null;
    }
  }

  if (typeof parsedMetadata !== "object" || parsedMetadata === null)
    return null;

  const evaluatorId = (parsedMetadata as Record<string, unknown>).evaluator_id;
  return typeof evaluatorId === "string" && evaluatorId.length > 0
    ? evaluatorId
    : null;
}
