import { spawnSync } from "child_process";
import { homedir } from "os";
import { join } from "path";
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
// which forces local mode and won't accept `format` as a subcommand. Prefer
// CLICKHOUSE_BIN, then PATH, then a user-local install — the PATH binary in
// some agent VMs is a docker wrapper that cannot run `format`.
function resolveClickhouseBin(): string {
  const candidates = [
    process.env.CLICKHOUSE_BIN,
    "clickhouse",
    join(homedir(), ".local/bin/clickhouse"),
  ].filter((bin): bin is string => Boolean(bin));

  for (const bin of candidates) {
    try {
      const res = spawnSync(bin, ["format"], {
        input: "SELECT 1",
        encoding: "utf8",
      });
      if (res.status === 0) return bin;
    } catch {
      // try the next candidate
    }
  }
  return "clickhouse";
}

const clickhouseBin = resolveClickhouseBin();

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

let localAvailability: boolean | undefined;

/** Whether `clickhouse local` can execute a query on this machine. */
export function clickhouseLocalAvailable(): boolean {
  if (localAvailability !== undefined) return localAvailability;
  try {
    const res = spawnSync(clickhouseBin, ["local", "--query", "SELECT 1"], {
      encoding: "utf8",
    });
    localAvailability = res.status === 0;
  } catch {
    localAvailability = false;
  }
  return localAvailability;
}

const NAMED_PARAM = /\{([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^}]+)\}/g;

function sqlLiteral(value: unknown, type: string): string {
  const t = type.trim();
  if (t.startsWith("Array")) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array bind for ${t}, got ${typeof value}`);
    }
    return `[${value.map((item) => sqlLiteral(item, "String")).join(", ")}]`;
  }
  if (t.startsWith("DateTime")) {
    const iso =
      value instanceof Date
        ? value.toISOString().replace("T", " ").replace("Z", "")
        : String(value);
    return `'${iso}'`;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${escaped}'`;
}

/** Replace `{name:Type}` placeholders with ClickHouse literals for local exec. */
export function substituteNamedParams(
  sql: string,
  params: Record<string, unknown>,
): string {
  return sql.replace(NAMED_PARAM, (_match, name: string, type: string) => {
    if (!(name in params)) {
      throw new Error(`Missing bind '${name}' for local execution`);
    }
    return sqlLiteral(params[name], type);
  });
}

/**
 * Run SQL through `clickhouse local` (no server). Throws on a non-zero status
 * so an analyzer/parse error fails the test instead of comparing stdout.
 */
export function executeClickhouseLocal(sql: string): string {
  const res = spawnSync(clickhouseBin, ["local", "--query", sql], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(
      `clickhouse local failed (status ${res.status}): ${res.stderr?.trim()}\n--- SQL ---\n${sql}`,
    );
  }
  return (res.stdout ?? "").trimEnd();
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
