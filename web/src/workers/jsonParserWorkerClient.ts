/**
 * Client for the JSON-parser Web Worker.
 *
 * Owns the single worker instance, the in-flight requests, and every way the
 * worker can stop answering. Both `useParsedTrace` and `useParsedObservation`
 * go through here; they used to carry a copy of this logic each, which is how
 * the same missing recovery path came to exist twice.
 *
 * Two properties this module exists to guarantee:
 *
 * 1. **The worker has no URL.** It is started from a blob built out of a string
 *    bundled at build time (`generated/json-parser.worker.source.ts`). A worker
 *    loaded from `/_next/static/chunks/...` 404s in any tab that outlives a
 *    deploy: those chunks are deliberately pinned to the app origin, and the app
 *    origin only ever serves the current build. A blob cannot 404, and worker
 *    and main thread always come from the same build.
 * 2. **A request always settles.** Every way the worker can stop answering —
 *    script error, silent death, a parse that never comes back — falls back to
 *    parsing on this thread. A request that never settles leaves the Raw tab on
 *    "Parsing in background…" for as long as the tab is open, and because the
 *    instance is reused, every later payload posts into the same dead worker:
 *    one reported error, unboundedly many stuck panels.
 */

import { deepParseJsonIterative } from "@langfuse/shared/src/utils/json";

import { reportParserWorkerError } from "@/src/hooks/parserWorkerError";
import { reportError } from "@/src/utils/reportError";

import { JSON_PARSER_WORKER_SOURCE } from "./generated/json-parser.worker.source";
import {
  MAIN_THREAD_PARSE_LIMITS,
  type ParseRequest,
  type ParseResponse,
} from "./json-parser.protocol";

/**
 * Payload size (in characters) from which parsing moves off the main thread.
 * Below it the message round trip costs more than the parse.
 */
export const PARSE_IN_WEBWORKER_THRESHOLD = 100_000; // 100KB

/**
 * How long one request may stay unanswered before the worker counts as dead.
 * A worker whose script fails reports through `onerror` within milliseconds;
 * this covers the silent deaths — OOM, a killed thread, an extension — where
 * nothing is reported at all. Generous on purpose: it is a liveness check, not
 * a performance budget.
 */
export const PARSE_DEADLINE_MS = 30_000;

/**
 * After this many missed deadlines the worker is not started again for the life
 * of the tab. One slow payload should not retire it; a worker that keeps dying
 * should not cost every later parse another full deadline.
 */
const MAX_DEADLINE_MISSES = 2;

export interface ParsedIo {
  input: unknown;
  output: unknown;
  metadata: unknown;
  parseTime: number;
}

interface PendingParse {
  request: ParseRequest;
  /** Owning hook, for Sentry context. */
  source: string;
  payloadChars: number;
  timer: ReturnType<typeof setTimeout>;
  resolve: (parsed: ParsedIo) => void;
  reject: (error: Error) => void;
}

let workerInstance: Worker | null = null;
let workerObjectUrl: string | null = null;
/** Set when the worker will not run — parse on this thread from now on. */
let workerUnavailable = false;
let deadlineMisses = 0;
let requestCounter = 0;
const pending = new Map<string, PendingParse>();

/** Estimate a value's size in characters, for the threshold check only. */
function estimateSize(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/**
 * Parse on this thread, under much stricter limits than the worker uses: this
 * one blocks rendering, so a pathological payload must not block it for long.
 */
function parseOnThisThread(
  input: unknown,
  output: unknown,
  metadata: unknown,
): ParsedIo {
  const startTime = performance.now();
  return {
    input: deepParseJsonIterative(input, MAIN_THREAD_PARSE_LIMITS),
    output: deepParseJsonIterative(output, MAIN_THREAD_PARSE_LIMITS),
    metadata: deepParseJsonIterative(metadata, MAIN_THREAD_PARSE_LIMITS),
    parseTime: performance.now() - startTime,
  };
}

/** {@link parseOnThisThread} as a promise, so a throwing parse rejects. */
function parseHere(
  input: unknown,
  output: unknown,
  metadata: unknown,
): Promise<ParsedIo> {
  try {
    return Promise.resolve(parseOnThisThread(input, output, metadata));
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/** Terminate the worker and release its blob URL. Leaves `pending` alone. */
function disposeWorker() {
  workerInstance?.terminate();
  workerInstance = null;
  if (workerObjectUrl) {
    URL.revokeObjectURL(workerObjectUrl);
    workerObjectUrl = null;
  }
}

/**
 * Retire the worker and answer everything it still owes on this thread.
 * Terminating is the only way to stop a worker mid-parse, and it is also what
 * makes those answers safe to produce here: nothing can arrive twice.
 */
function retireWorker() {
  disposeWorker();
  const carried = [...pending.values()];
  pending.clear();
  for (const entry of carried) {
    clearTimeout(entry.timer);
    const { input, output, metadata } = entry.request;
    parseHere(input, output, metadata).then(entry.resolve, entry.reject);
  }
}

function handleMessage(event: MessageEvent<ParseResponse>) {
  const entry = pending.get(event.data.id);
  if (!entry) return; // already answered by a deadline or a retirement
  pending.delete(event.data.id);
  clearTimeout(entry.timer);

  if (event.data.error) {
    entry.reject(new Error(event.data.error));
    return;
  }

  entry.resolve({
    input: event.data.parsedInput,
    output: event.data.parsedOutput,
    metadata: event.data.parsedMetadata,
    parseTime: event.data.parseTime ?? 0,
  });
}

function handleError(event: ErrorEvent) {
  // `onerror` means the worker SCRIPT failed, not that a parse threw — a parse
  // that throws answers over the message channel. Nothing will make this blob
  // run, so stop trying for the life of the tab and degrade to this thread.
  workerUnavailable = true;
  reportParserWorkerError("jsonParserWorker", event, {
    waiting: [...new Set([...pending.values()].map((entry) => entry.source))],
  });
  retireWorker();
}

function onDeadline(id: string) {
  const entry = pending.get(id);
  if (!entry) return;

  deadlineMisses += 1;
  if (deadlineMisses >= MAX_DEADLINE_MISSES) workerUnavailable = true;

  // The only instrument that can see this symptom at all. A worker that dies
  // without firing `onerror` reports nothing, and the stuck panel it used to
  // leave behind was invisible in Sentry by construction.
  reportError(
    new Error(
      `[${entry.source}] JSON parse worker did not answer within ${PARSE_DEADLINE_MS}ms`,
    ),
    {
      area: "io-parse-worker",
      tags: { outcome: "deadline-fallback" },
      extra: {
        workerHook: entry.source,
        payloadChars: entry.payloadChars,
        deadlineMisses,
        workerRetired: workerUnavailable,
      },
      warnMessage: `${entry.source} JSON parse worker missed its deadline, parsing on the main thread instead`,
    },
  );

  retireWorker();
}

function getOrCreateWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (typeof window === "undefined" || !window.Worker) return null;
  if (workerInstance) return workerInstance;

  try {
    workerObjectUrl = URL.createObjectURL(
      new Blob([JSON_PARSER_WORKER_SOURCE], { type: "text/javascript" }),
    );
    const worker = new Worker(workerObjectUrl);
    worker.onmessage = handleMessage;
    worker.onerror = handleError;
    workerInstance = worker;
  } catch (error) {
    workerUnavailable = true;
    disposeWorker();
    reportError(error, {
      area: "io-parse-worker",
      warnMessage: "could not start the JSON parse worker",
    });
    return null;
  }

  return workerInstance;
}

/**
 * Parse trace or observation I/O, off the main thread when the payload is big
 * enough to be worth the round trip.
 *
 * Never rejects because of worker trouble: anything the worker cannot do is
 * done on this thread instead. It rejects only when the parse itself fails.
 */
export function parseIoOffThread({
  source,
  input,
  output,
  metadata,
}: {
  /** Owning hook, for Sentry context. */
  source: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
}): Promise<ParsedIo> {
  const payloadChars =
    estimateSize(input) + estimateSize(output) + estimateSize(metadata);

  const worker =
    payloadChars < PARSE_IN_WEBWORKER_THRESHOLD ? null : getOrCreateWorker();

  if (!worker) return parseHere(input, output, metadata);

  return new Promise<ParsedIo>((resolve, reject) => {
    const id = `${Date.now()}-${++requestCounter}`;
    const request: ParseRequest = { id, input, output, metadata };
    pending.set(id, {
      request,
      source,
      payloadChars,
      timer: setTimeout(() => onDeadline(id), PARSE_DEADLINE_MS),
      resolve,
      reject,
    });
    worker.postMessage(request);
  });
}
