import { spawnSync } from "child_process";
import { Readable } from "stream";

import type * as ClickhouseModule from "../repositories/clickhouse";

/**
 * Golden-SQL recording/diff harness for the query-builder AST refactor.
 *
 * The query-builder AST refactor migrates repository call sites one family at a
 * time. Every migration must prove that the AST-compiled SQL is equivalent to
 * the SQL emitted today. This harness captures that "today" baseline once and
 * lets each later migration replay through it.
 *
 * Two independent pieces, both server-only and test-scoped:
 *
 *   1. Capture — {@link buildClickhouseMock} replaces the six exec functions in
 *      `repositories/clickhouse.ts` with recorders that push `(fn, query,
 *      params, tags)` into {@link capturedQueries} and return benign empty
 *      results. A test drives a real repository function with fixed inputs; the
 *      SQL it would have sent is captured without touching a ClickHouse server.
 *
 *   2. Golden check — {@link normalizeCapturedQueries} normalizes each captured
 *      query so two structurally-equal statements compare equal regardless of
 *      formatting or param naming: it pipes the SQL through `clickhouse format`
 *      (via `clickhouse-local`'s multi-binary — no server state) and rewrites
 *      param placeholders to positional tokens (today's are random-suffixed at
 *      several sites). The normalized value is what a Vitest snapshot stores.
 *
 * `system.query_log` is a corpus-discovery source only, never a harness source.
 */

/**
 * A single exec-seam call captured in test mode.
 *
 * We capture only the SQL text, its params, and the tags — the parts the AST
 * compiler is responsible for producing. Every other `ClickhouseQueryOpts`
 * field (`clickhouseSettings`, `preferredClickhouseService`,
 * `useMultipartParamsAuto`, …) is a client-side execution/routing knob that
 * doesn't change the query text ClickHouse parses, so it's intentionally left
 * out of the baseline.
 *
 * KNOWN GAP: `queryClickhouseExecRaw` is the one exception — its real seam sends
 * `${query}\nFORMAT ${format}`, so `format` *is* part of the wire-level query
 * text. We deliberately ignore it for now: no exec-raw call site is golden-
 * tested yet (this file only drives `queryClickhouse`). Before the first
 * exec-raw site is migrated onto this harness, thread `format` into
 * CapturedQuery/GoldenQuery and fold `FORMAT <format>` into the normalized SQL,
 * or two exec-raw calls differing only in `format` (e.g. JSONEachRow vs
 * Parquet) would snapshot identically.
 */
export type CapturedQuery = {
  /** Which of the six exec functions the repository called. */
  fn: string;
  query: string;
  params?: Record<string, unknown>;
  /** The `tags` bag, whose `route` identifies the call site (see queryTags.ts). */
  tags?: unknown;
};

/** Module-singleton capture store. Same instance for the mock and the test. */
export const capturedQueries: CapturedQuery[] = [];

export function resetCaptures(): void {
  capturedQueries.length = 0;
}

function capture(
  fn: string,
  opts: { query: string; params?: Record<string, unknown>; tags?: unknown },
): void {
  capturedQueries.push({
    fn,
    query: opts.query,
    params: opts.params,
    tags: opts.tags,
  });
}

/**
 * Build the mock module object for `vi.mock("../repositories/clickhouse")`.
 * Spreads the real module so non-exec exports (`upsertClickhouse`, error
 * classes, re-exports) keep working, then overrides the six read/exec seams
 * with recorders. Each recorder honors its original signature — arrays,
 * async generators, and the exec-raw stream shape — so callers that iterate or
 * read a stream don't blow up while being recorded.
 */
export function buildClickhouseMock(
  actual: typeof ClickhouseModule,
): typeof ClickhouseModule {
  return {
    ...actual,
    queryClickhouse: async (opts) => {
      capture("queryClickhouse", opts);
      return [];
    },
    queryClickhouseStream: async function* (opts) {
      capture("queryClickhouseStream", opts);
      yield* [];
    },
    queryClickhouseStreamRawText: async function* (opts) {
      capture("queryClickhouseStreamRawText", opts);
      yield* [];
    },
    queryClickhouseWithProgress: async function* (opts) {
      capture("queryClickhouseWithProgress", opts);
      yield* [];
    },
    queryClickhouseExecRaw: async (opts) => {
      // NOTE: `opts.format` is dropped here on purpose — see CapturedQuery's
      // "KNOWN GAP". Revisit before any exec-raw call site is golden-tested.
      capture("queryClickhouseExecRaw", opts);
      return {
        queryId: "golden-harness",
        stream: Readable.from([]),
        responseHeaders: {},
      };
    },
    commandClickhouse: async (opts) => {
      capture("commandClickhouse", opts);
    },
  } as typeof ClickhouseModule;
}

/** The normalized form of one captured query — the unit a golden snapshot holds. */
export type GoldenQuery = {
  fn: string;
  /** `route` tag if the call site set one, else `"unknown"`. */
  route: string;
  /** Formatted (via `clickhouse format`) and param-normalized SQL. */
  sql: string;
  /** Params bound by the query, keyed by their positional token; only those
   * actually referenced in the SQL are kept (unreferenced binds are no-ops). */
  params: Record<string, unknown>;
};

// The `clickhouse` multi-binary's `format` subcommand. Not `clickhouse-local`,
// which forces local mode and won't accept `format` as a subcommand.
const clickhouseBin = "clickhouse";

let formatAvailability: boolean | undefined;

/**
 * Whether `clickhouse format` can run here. The golden check needs it; gate the
 * suite on this so a machine (or CI job) without the binary skips loudly rather
 * than silently passing an unnormalized comparison.
 */
export function clickhouseFormatAvailable(): boolean {
  if (formatAvailability !== undefined) return formatAvailability;
  try {
    const res = spawnSync(clickhouseBin, ["format"], {
      input: "SELECT 1",
      encoding: "utf8",
    });
    formatAvailability = res.status === 0;
  } catch {
    formatAvailability = false;
  }
  return formatAvailability;
}

/**
 * Canonicalize SQL through `clickhouse format` (whitespace, parenthesization,
 * keyword casing). Uses the `clickhouse` multi-binary's `format` subcommand,
 * which `clickhouse-local` provides — no server, no state. Throws on a parse
 * error so malformed SQL fails the test instead of comparing raw.
 */
export function formatSql(sql: string): string {
  const res = spawnSync(clickhouseBin, ["format"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(
      `clickhouse format failed (status ${res.status}): ${res.stderr?.trim()}\n--- SQL ---\n${sql}`,
    );
  }
  return res.stdout.trimEnd();
}

const PARAM_PLACEHOLDER = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g;

/**
 * Rewrite ClickHouse `{name:Type}` placeholders to positional tokens
 * (`param1`, `param2`, …) in first-occurrence order, remapping the params map
 * to match. Defeats random-suffixed param names so equivalent queries compare
 * equal. Params never referenced in the SQL are dropped — they bind nothing.
 */
export function normalizeParams(
  sql: string,
  params?: Record<string, unknown>,
): { sql: string; params: Record<string, unknown> } {
  const mapping = new Map<string, string>();
  const normalizedSql = sql.replace(
    PARAM_PLACEHOLDER,
    (_match, name: string) => {
      if (!mapping.has(name)) mapping.set(name, `param${mapping.size + 1}`);
      return `{${mapping.get(name)}:`;
    },
  );

  const normalizedParams: Record<string, unknown> = {};
  if (params) {
    for (const [key, token] of mapping) {
      if (key in params) normalizedParams[token] = params[key];
    }
  }
  return { sql: normalizedSql, params: normalizedParams };
}

function routeOf(tags: unknown): string {
  if (tags && typeof tags === "object" && "route" in tags) {
    const route = (tags as { route?: unknown }).route;
    if (typeof route === "string" && route.trim()) return route.trim();
  }
  return "unknown";
}

/**
 * Normalize an ordered list of captured queries into golden entries. The order
 * is significant — one repository call may emit several queries (e.g.
 * environments emits its tracing read and its scores read), and their sequence
 * is part of the baseline.
 */
export function normalizeCapturedQueries(
  captured: readonly CapturedQuery[],
): GoldenQuery[] {
  return captured.map((c) => {
    const { sql, params } = normalizeParams(formatSql(c.query), c.params);
    return { fn: c.fn, route: routeOf(c.tags), sql, params };
  });
}
