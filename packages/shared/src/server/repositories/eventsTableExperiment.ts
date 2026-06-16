import { env } from "../../env";
import { logger } from "../logger";
import { recordHistogram, recordIncrement } from "../instrumentation";

/**
 * Shadow-comparison experiment for the Traces public API.
 *
 * On a configurable fraction of requests we run *both* read paths (the new
 * events table and the legacy traces/observations tables), compare the results
 * field-by-field, and record latency + diff metrics. The data returned to the
 * caller is never affected: the caller always receives the result of the path
 * it selected (via `useEventsTable`). The other path runs purely as a shadow
 * read for validation.
 */

export type ExperimentSource = "events" | "legacy";

export type FieldDiff = {
  /** Full path to the differing value, e.g. "data[2].metadata.foo". */
  path: string;
  /** Leaf field name, used as a low-cardinality metric tag, e.g. "metadata". */
  field: string;
  legacy: unknown;
  events: unknown;
};

export type DiffOptions = {
  /** Leaf field names compared with `epsilon` tolerance instead of strict equality. */
  numericFields?: Set<string>;
  epsilon?: number;
};

const DEFAULT_EPSILON = 1e-6;

/**
 * Decide whether to run the shadow comparison for the current request.
 * Returns false fast when the sample rate is 0 (experiment disabled).
 */
export const shouldRunEventsTableExperiment = (): boolean => {
  const rate = env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE;
  if (!rate || rate <= 0) return false;
  return Math.random() < rate;
};

/**
 * Normalize a value into a stable, comparable structure:
 * - null/undefined collapse to null (JSON serialization drops undefined)
 * - Dates become epoch millis
 * - JSON-looking strings are parsed so structural equality is order-independent
 * - object keys are sorted; arrays are sorted by a stable key (`id` when present)
 */
const normalize = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();

  // Decimal-like values (e.g. Decimal.js) -> number, so they compare by value
  // and benefit from the numeric epsilon tolerance.
  if (
    typeof value === "object" &&
    typeof (value as { toNumber?: unknown }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const looksLikeJson =
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"));
    if (looksLikeJson) {
      try {
        return normalize(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    const normalized = value.map(normalize);
    return [...normalized].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = normalize(obj[key]);
    }
    return out;
  }

  return value;
};

const sortKey = (value: unknown): string => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).id === "string"
  ) {
    return (value as Record<string, string>).id;
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const collectDiffs = (
  legacy: unknown,
  events: unknown,
  path: string,
  field: string,
  opts: DiffOptions,
  out: FieldDiff[],
): void => {
  if (typeof legacy === "number" && typeof events === "number") {
    const tol = opts.numericFields?.has(field)
      ? (opts.epsilon ?? DEFAULT_EPSILON)
      : 0;
    if (Math.abs(legacy - events) > tol) {
      out.push({ path, field, legacy, events });
    }
    return;
  }

  if (Array.isArray(legacy) && Array.isArray(events)) {
    if (legacy.length !== events.length) {
      out.push({
        path,
        field,
        legacy: `length=${legacy.length}`,
        events: `length=${events.length}`,
      });
    }
    const n = Math.min(legacy.length, events.length);
    for (let i = 0; i < n; i++) {
      collectDiffs(legacy[i], events[i], `${path}[${i}]`, field, opts, out);
    }
    return;
  }

  if (isPlainObject(legacy) && isPlainObject(events)) {
    const keys = new Set([...Object.keys(legacy), ...Object.keys(events)]);
    for (const key of keys) {
      collectDiffs(
        legacy[key],
        events[key],
        path ? `${path}.${key}` : key,
        key,
        opts,
        out,
      );
    }
    return;
  }

  // primitives or mismatched types
  if (JSON.stringify(legacy) !== JSON.stringify(events)) {
    out.push({ path, field, legacy, events });
  }
};

/**
 * Field-by-field diff of two results after normalization. Returns an empty
 * array when the two results are considered identical.
 */
export const diffResults = (
  legacy: unknown,
  events: unknown,
  opts: DiffOptions = {},
): FieldDiff[] => {
  const out: FieldDiff[] = [];
  collectDiffs(normalize(legacy), normalize(events), "", "", opts, out);
  return out;
};

const MAX_LOGGED_DIFFS = 50;
const MAX_LOGGED_VALUE_LENGTH = 500;

const truncateForLog = (value: unknown): unknown => {
  let serialized: string;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    serialized = String(value);
  }
  if (serialized && serialized.length > MAX_LOGGED_VALUE_LENGTH) {
    return `${serialized.slice(0, MAX_LOGGED_VALUE_LENGTH)}…[truncated]`;
  }
  return value;
};

const recordExperimentDiffs = (params: {
  feature: string;
  projectId: string;
  diffs: FieldDiff[];
  logContext?: Record<string, unknown>;
}): void => {
  const { feature, projectId, diffs, logContext } = params;
  const match = diffs.length === 0;

  recordIncrement("langfuse.events_table_experiment.result", 1, {
    feature,
    match: match ? "true" : "false",
  });

  if (match) return;

  // Dedupe by leaf field name to keep metric cardinality bounded and avoid
  // inflating counts when an array of objects differs in the same field.
  const seenFields = new Set<string>();
  for (const diff of diffs) {
    if (seenFields.has(diff.field)) continue;
    seenFields.add(diff.field);
    recordIncrement("langfuse.events_table_experiment.field_mismatch", 1, {
      feature,
      field: diff.field || "root",
    });
  }

  logger.info("events table experiment mismatch", {
    feature,
    projectId,
    diffCount: diffs.length,
    fields: Array.from(seenFields),
    diffs: diffs.slice(0, MAX_LOGGED_DIFFS).map((diff) => ({
      path: diff.path || "root",
      field: diff.field || "root",
      legacy: truncateForLog(diff.legacy),
      events: truncateForLog(diff.events),
    })),
    ...logContext,
  });
};

type TimedResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Run a read path, timing it and recording the latency histogram on success. */
const timeRead = async <T>(
  feature: string,
  source: ExperimentSource,
  fn: () => Promise<T>,
): Promise<TimedResult<T>> => {
  const start = Date.now();
  try {
    const value = await fn();
    recordHistogram(
      "langfuse.events_table_experiment.latency_ms",
      Date.now() - start,
      { feature, source },
    );
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  }
};

/**
 * Runs the experiment for a single request.
 *
 * When NOT sampled, the `selected` path (matching `useEventsTable`) is run and
 * returned with zero experiment overhead — no extra read, no metrics.
 *
 * When sampled, both read paths run CONCURRENTLY (so the added wall-clock cost
 * is roughly the slower read rather than the sum), their latencies are
 * recorded, and the results are compared via `compare`. The caller always
 * receives the `selected` path's result; a shadow read failure never breaks the
 * response, and the `selected` path's error always propagates.
 */
export const runEventsTableExperiment = async <T>(params: {
  /** Low-cardinality feature label, e.g. "traces.list" or "traces.byId". */
  feature: string;
  projectId: string;
  selected: ExperimentSource;
  events: () => Promise<T>;
  legacy: () => Promise<T>;
  /** Compute field-level diffs between the legacy and events results. */
  compare: (legacyResult: T, eventsResult: T) => FieldDiff[];
  logContext?: Record<string, unknown>;
}): Promise<T> => {
  const { feature, projectId, selected, events, legacy, compare, logContext } =
    params;

  const selectedFn = selected === "events" ? events : legacy;

  // Fast path: experiment disabled / not sampled. No second read, no metrics.
  if (!shouldRunEventsTableExperiment()) {
    return selectedFn();
  }

  const otherSource: ExperimentSource =
    selected === "events" ? "legacy" : "events";
  const otherFn = selected === "events" ? legacy : events;

  // Run both paths concurrently so the shadow read does not add its full
  // latency on top of the response we return.
  const [selectedRes, otherRes] = await Promise.all([
    timeRead(feature, selected, selectedFn),
    timeRead(feature, otherSource, otherFn),
  ]);

  // The selected path is the real response: its failure must propagate.
  if (!selectedRes.ok) {
    throw selectedRes.error;
  }

  if (!otherRes.ok) {
    recordIncrement("langfuse.events_table_experiment.shadow_error", 1, {
      feature,
    });
    logger.warn("events table experiment shadow read failed", {
      feature,
      projectId,
      shadowSource: otherSource,
      error:
        otherRes.error instanceof Error
          ? otherRes.error.message
          : String(otherRes.error),
      ...logContext,
    });
    return selectedRes.value;
  }

  try {
    const legacyResult =
      selected === "events" ? otherRes.value : selectedRes.value;
    const eventsResult =
      selected === "events" ? selectedRes.value : otherRes.value;
    const diffs = compare(legacyResult, eventsResult);
    recordExperimentDiffs({ feature, projectId, diffs, logContext });
  } catch (error) {
    logger.warn("events table experiment comparison failed", {
      feature,
      projectId,
      error: error instanceof Error ? error.message : String(error),
      ...logContext,
    });
  }

  return selectedRes.value;
};
