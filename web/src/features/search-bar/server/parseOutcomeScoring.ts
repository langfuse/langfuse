// Score the PARSE OUTCOME of an Ask AI filter completion onto the
// generation's trace in the AI-features Langfuse project, so production
// traffic becomes a queryable, self-harvesting quality signal instead of
// only a server `logger.warn` (see `router.ts`'s `generateFilter`, which
// already logs `droppedCount`/`unknownScoreNames` but never persists them).
//
// Split pure derivation (`deriveParseOutcomeScores`, unit-tested directly)
// from the I/O (`recordParseOutcomeScores`, fire-and-forget, never throws)
// for the same reason `parseFilterCompletion.ts` keeps parsing separate from
// the tRPC procedure: the branching logic should be testable without a live
// model OR a live Langfuse client.

import { Langfuse } from "langfuse";
import { logger } from "@langfuse/shared/src/server";
import { getProductBaseUrl } from "@/src/utils/base-url";
import type { GeneratedFilters } from "./parseFilterCompletion";

export type ParseOutcomeScoreName =
  | "parse-empty-result"
  | "parse-dropped-filters"
  | "parse-unknown-score-names"
  | "filter-count"
  | "output-markdown-fenced";

export type ParseOutcomeScore = {
  name: ParseOutcomeScoreName;
  value: number;
  dataType: "NUMERIC" | "BOOLEAN";
  /** Short, human-readable context attached to exactly one score so a
   *  reviewer can see what actually applied without decoding the raw
   *  completion. */
  comment?: string;
};

// Keep the attached query text short — this is a glance-in-the-UI
// annotation, not a second copy of the trace input/output.
const MAX_QUERY_TEXT_COMMENT_LENGTH = 500;

/**
 * Pure derivation of the parse-outcome scores from the raw completion string
 * and the `parseGeneratedFilters` result. No I/O — this is what the unit
 * tests exercise directly, without a live Langfuse client.
 */
export function deriveParseOutcomeScores(
  raw: string,
  parsed: Pick<
    GeneratedFilters,
    "filters" | "queryText" | "droppedCount" | "unknownScoreNames"
  >,
): ParseOutcomeScore[] {
  const queryTextComment =
    parsed.queryText.length > 0
      ? parsed.queryText.slice(0, MAX_QUERY_TEXT_COMMENT_LENGTH)
      : undefined;

  return [
    {
      name: "parse-empty-result",
      dataType: "BOOLEAN",
      value: parsed.filters.length === 0 ? 1 : 0,
    },
    {
      name: "parse-dropped-filters",
      dataType: "NUMERIC",
      value: parsed.droppedCount,
    },
    {
      name: "parse-unknown-score-names",
      dataType: "NUMERIC",
      value: parsed.unknownScoreNames.length,
    },
    {
      name: "filter-count",
      dataType: "NUMERIC",
      value: parsed.filters.length,
      // Attached here (rather than a new field/metadata write) so a
      // reviewer can see what actually got applied without decoding the raw
      // completion — this score is the closest proxy for "did the request
      // resolve to a real answer".
      comment: queryTextComment,
    },
    {
      // THE key Haiku-adherence signal we're watching while tuning the
      // prompt: the system prompt says "no markdown fences", yet the model
      // frequently wraps its JSON answer in ```...``` anyway. Computed from
      // the RAW completion (before any parsing/extraction), so it reflects
      // the model's literal output regardless of whether parsing recovered
      // from it.
      name: "output-markdown-fenced",
      dataType: "BOOLEAN",
      value: /```/.test(raw) ? 1 : 0,
    },
  ];
}

// A dedicated singleton, deliberately SEPARATE from
// `../../natural-language-filters/server/utils.ts`'s `getLangfuseClient`.
// Every existing caller of that helper passes `enabled: false` (it is only
// ever used to fetch a managed prompt, never to write events), and the
// helper memoizes on the FIRST call regardless of the `enabled` argument any
// later caller passes — reusing it here would silently turn every
// `.score()` call below into a no-op for the lifetime of the process, the
// moment any caller (anywhere) constructs it disabled first.
let scoreClient: Langfuse | null = null;

function getParseOutcomeScoreClient(params: {
  publicKey: string;
  secretKey: string;
  baseUrl: string | undefined;
}): Langfuse {
  if (!scoreClient) {
    scoreClient = new Langfuse({
      publicKey: params.publicKey,
      secretKey: params.secretKey,
      // Mirrors `getLangfuseClient`'s fallback: self-referential deployments
      // (e.g. PR previews) must talk to themselves, not cloud.langfuse.com.
      baseUrl: params.baseUrl ?? getProductBaseUrl().toString(),
      // This path must never affect the user-facing response (see
      // `recordParseOutcomeScores`), so a slow/unreachable AI-features
      // project should fail fast in the background rather than retry.
      fetchRetryCount: 0,
      requestTimeout: 3_000,
    });
  }
  return scoreClient;
}

// Bounds how long `recordParseOutcomeScores` waits on the background flush
// before giving up — the SDK's own request keeps running (or times out via
// `requestTimeout` above) regardless; this only bounds how long our
// fire-and-forget promise chain stays alive.
const FLUSH_TIMEOUT_MS = 2_000;

/**
 * Fire-and-forget: attaches `scores` to `traceId` in the AI-features
 * Langfuse project. Never throws and returns no promise for the caller to
 * await — every failure mode (client construction, `.score()`, flushing)
 * resolves to a `logger.warn`, so a slow or unreachable AI-features project
 * can never add latency to, or break, the user's response.
 */
export function recordParseOutcomeScores(params: {
  traceId: string;
  scores: ParseOutcomeScore[];
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}): void {
  // `.catch` (rather than `await`/`void`) is the whole point: the caller
  // gets a plain `void`-returning function back and never sees a promise to
  // accidentally await, while this one is still guaranteed "handled" so it
  // can never surface as an unhandled rejection.
  runParseOutcomeScoring(params).catch((error) => {
    logger.warn("Failed to record Ask AI parse-outcome scores", {
      traceId: params.traceId,
      error,
    });
  });
}

async function runParseOutcomeScoring(params: {
  traceId: string;
  scores: ParseOutcomeScore[];
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}): Promise<void> {
  const { traceId, scores, publicKey, secretKey, baseUrl } = params;
  const client = getParseOutcomeScoreClient({ publicKey, secretKey, baseUrl });
  for (const score of scores) {
    client.score({
      traceId,
      name: score.name,
      value: score.value,
      dataType: score.dataType,
      ...(score.comment ? { comment: score.comment } : {}),
    });
  }
  // `.catch` here (rather than only relying on the caller's `.catch` above)
  // means the flush promise is always settled before the race below can
  // move on, so a late rejection can never surface as an unhandled promise
  // rejection after the timeout wins.
  const flushed = client.flushAsync().catch((error) => {
    logger.warn("Ask AI parse-outcome score flush failed", {
      traceId,
      error,
    });
  });
  await Promise.race([
    flushed,
    new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
  ]);
}
