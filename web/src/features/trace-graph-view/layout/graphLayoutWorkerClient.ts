import ELKConstructor from "elkjs/lib/elk-api";
import type { ELK } from "elkjs";

import { reportError } from "@/src/utils/reportError";

import { type GraphCanvasData } from "../types";
import {
  layoutGraphOnThisThread,
  prepareGraphLayout,
  runGraphLayout,
  type GraphLayout,
  type GraphLayoutDirection,
  type GraphLayoutRequest,
} from "./elkLayout";

/**
 * Wall-clock ceiling for one layout, and the real layout budget: cost depends far
 * more on graph SHAPE than on size (measured with the app's layout options, same
 * counts: a graph whose edges concentrate on a few nodes lays out 60 nodes / 300
 * edges in ~0.35s, while a uniformly dense one of the same counts takes ~16s), so
 * no node/edge count can predict it. ELK can't be interrupted even in a worker, so
 * the deadline is enforced by terminating the worker and showing the "too large"
 * notice. See MAX_GRAPH_LAYOUT_* for the count ceiling that stays.
 */
export const GRAPH_LAYOUT_DEADLINE_MS = 60_000;

/**
 * A superseded layout is killed only once it has been running this long: past it,
 * the stale layout is holding the single worker thread and would delay the layout
 * that replaced it; below it, letting it finish and discarding the result is
 * cheaper than a fresh worker startup on every view-mode toggle.
 */
const TERMINATE_STALE_AFTER_MS = 250;

type PendingLayout = {
  id: string;
  request: GraphLayoutRequest;
  startedAt: number;
  timer: ReturnType<typeof setTimeout>;
  resolve: (layout: GraphLayout) => void;
  reject: (error: Error) => void;
};

/** ELK plus the worker it runs in — we own the worker so we can terminate it. */
type LayoutWorker = { elk: ELK; worker: Worker };

const pending = new Map<string, PendingLayout>();
let active: LayoutWorker | null = null;
/** Set when the worker script itself won't load — degrade to the main thread. */
let workerUnavailable = false;
let requestCounter = 0;

export class GraphLayoutCancelledError extends Error {
  constructor() {
    super("Graph layout cancelled");
    this.name = "GraphLayoutCancelledError";
  }
}

/** The "too large to lay out" answer, carrying the counts the notice shows. */
function refusedLayout(request: GraphLayoutRequest): GraphLayout {
  return {
    nodes: [],
    edges: [],
    width: 0,
    height: 0,
    tooLarge: true,
    nodeCount: request.nodes.length,
    edgeCount: request.edges.length,
  };
}

function handleWorkerError(event: ErrorEvent) {
  // `onerror` means the worker SCRIPT failed — a stale chunk after a deploy is
  // the dominant cause. (A layout that throws rejects its own promise instead.)
  // Retire the worker and lay out on the main thread: slow beats no graph at all.
  workerUnavailable = true;
  const details = `${event.message || "unknown"} @ ${event.filename || "?"}:${event.lineno ?? "?"}`;
  reportError(
    event.error instanceof Error
      ? event.error
      : new Error(`ELK layout worker failed to load: ${details}`),
    {
      area: "graph-layout-worker",
      extra: {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
      },
      warnMessage: `ELK layout worker failed to load: ${details}`,
    },
  );
  restartWorker();
}

function getLayoutWorker(): LayoutWorker | null {
  if (workerUnavailable) return null;
  if (typeof window === "undefined" || !window.Worker) return null;
  if (active) return active;
  try {
    const worker = new Worker(
      new URL("@/src/workers/elk-layout.worker.ts", import.meta.url),
    );
    worker.onerror = handleWorkerError;
    // elk-api only sets `onmessage` on the worker we hand it, so the instance
    // above stays ours to terminate.
    const elk = new ELKConstructor({ workerFactory: () => worker });
    active = { elk, worker };
  } catch (error) {
    workerUnavailable = true;
    active = null;
    reportError(error, {
      area: "graph-layout-worker",
      warnMessage: "could not start the ELK layout worker",
    });
    return null;
  }
  return active;
}

/** Run one request on `target`, tracked so it can be cancelled or timed out. */
function dispatch(entry: PendingLayout, target: LayoutWorker) {
  pending.set(entry.id, entry);
  runGraphLayout(target.elk, entry.request).then(
    (layout) => settle(entry.id, (found) => found.resolve(layout)),
    (error: unknown) =>
      settle(entry.id, (found) =>
        found.reject(error instanceof Error ? error : new Error(String(error))),
      ),
  );
}

/**
 * Answer a request — unless it is no longer pending, which is the staleness
 * guard: the worker outlives individual callers, so a result that arrives after
 * its cancellation or deadline must never land on a newer graph.
 */
function settle(id: string, finish: (entry: PendingLayout) => void) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  finish(entry);
}

/**
 * Terminate the worker — the only way to stop an in-flight ELK run — and re-issue
 * whatever else was queued behind it on a fresh one (it was waiting on a thread
 * that no longer exists).
 */
function restartWorker() {
  const carried = [...pending.values()];
  pending.clear();
  active?.worker.terminate();
  active = null;
  if (carried.length === 0) return;
  const target = getLayoutWorker();
  for (const entry of carried) {
    if (target) dispatch(entry, target);
    else
      layoutGraphOnThisThread(entry.request).then(entry.resolve, entry.reject);
  }
}

function cancel(id: string) {
  const entry = pending.get(id);
  if (!entry) return; // already answered
  pending.delete(id);
  clearTimeout(entry.timer);
  if (performance.now() - entry.startedAt > TERMINATE_STALE_AFTER_MS) {
    restartWorker();
  }
  entry.reject(new GraphLayoutCancelledError());
}

function onDeadline(id: string) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  restartWorker();
  entry.resolve(refusedLayout(entry.request));
}

/**
 * Lay the graph out in the ELK worker, so the rest of the trace view (tree, tabs,
 * navigation) stays interactive while ELK grinds.
 *
 * Abort via `signal` when the request goes stale (trace, view mode or direction
 * changed): the promise rejects with {@link GraphLayoutCancelledError} and a late
 * result can never land on the newer graph.
 */
export function requestGraphLayout(
  graph: GraphCanvasData,
  nodeToObservationsMap: Record<string, string[]> = {},
  direction: GraphLayoutDirection = "DOWN",
  signal?: AbortSignal,
): Promise<GraphLayout> {
  // Dedupe, size and gate before touching the worker: all O(nodes + edges), and
  // it keeps the posted payload to the deduped graph — postMessage's structured
  // clone is main-thread work too.
  const prepared = prepareGraphLayout(graph, nodeToObservationsMap, direction);
  if (prepared.kind === "layout") return Promise.resolve(prepared.layout);

  const target = getLayoutWorker();
  if (!target) return layoutGraphOnThisThread(prepared.request);

  return new Promise<GraphLayout>((resolve, reject) => {
    const id = String(++requestCounter);
    dispatch(
      {
        id,
        request: prepared.request,
        startedAt: performance.now(),
        timer: setTimeout(() => onDeadline(id), GRAPH_LAYOUT_DEADLINE_MS),
        resolve,
        reject,
      },
      target,
    );
    signal?.addEventListener("abort", () => cancel(id), { once: true });
  });
}
