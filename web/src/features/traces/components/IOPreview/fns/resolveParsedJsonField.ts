import { deepParseJson, type DeepParseJsonOptions } from "@langfuse/shared";

/**
 * Resolve a pre-parsed JSON field without treating JSON `null` as missing.
 *
 * `??` coalesces both `null` and `undefined`. Call sites often pass
 * `value ?? undefined`, so a stored JSON null becomes JS undefined on the
 * raw prop while the worker still parsed it as `null`. Falling through then
 * renders `undefined` in JSON view and `null` in pretty view.
 *
 * JSON has no `undefined`. Normalize it to `null` so empty input and empty
 * output look the same in every I/O view.
 */
export function resolveParsedJsonField(
  parsed: unknown,
  raw: unknown,
  options?: DeepParseJsonOptions,
): unknown {
  const value = parsed !== undefined ? parsed : deepParseJson(raw, options);
  return value === undefined ? null : value;
}
