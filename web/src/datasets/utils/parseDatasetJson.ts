import { isJsonNumberLiteral, parseJsonPrioritised } from "@langfuse/shared";

export function parseDatasetJson(value: string): unknown {
  return parseJsonPrioritised(value);
}

export function isDatasetJsonParseFailure(
  value: string,
  parsed: unknown = parseDatasetJson(value),
): boolean {
  if (value === "") return false;

  return (
    parsed === value && parsed !== undefined && !isJsonNumberLiteral(value)
  );
}

export function isValidDatasetJson(value: string): boolean {
  if (value === "") return true;

  const parsed = parseDatasetJson(value);
  if (parsed === undefined) return false;

  return !isDatasetJsonParseFailure(value, parsed);
}
