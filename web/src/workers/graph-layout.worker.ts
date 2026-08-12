/**
 * Web Worker for trace-graph ELK layout.
 *
 * elkjs is synchronous and uninterruptible, so on the main thread a large graph
 * froze the whole tab for as long as the layout took. Here that block is
 * confined to this thread: the tree view, tabs and navigation stay live, and the
 * client cancels a stale layout by terminating the worker.
 */

import ELKConstructor from "elkjs/lib/elk.bundled.js";
import type { ELK } from "elkjs";
import {
  runGraphLayout,
  type GraphLayout,
  type GraphLayoutRequest,
} from "@/src/features/trace-graph-view/layout/elkLayout";

export interface GraphLayoutWorkerRequest {
  id: string;
  request: GraphLayoutRequest;
}

export interface GraphLayoutWorkerResponse {
  id: string;
  layout?: GraphLayout;
  /** Set instead of `layout` when ELK threw (e.g. "too much recursion"). */
  error?: string;
  layoutTime: number;
}

const elk: ELK = new (ELKConstructor as unknown as { new (): ELK })();

self.onmessage = async (e: MessageEvent<GraphLayoutWorkerRequest>) => {
  const { id, request } = e.data;
  const start = performance.now();

  try {
    const layout = await runGraphLayout(elk, request);
    const response: GraphLayoutWorkerResponse = {
      id,
      layout,
      layoutTime: performance.now() - start,
    };
    self.postMessage(response);
  } catch (error) {
    // Answer every request, including failures: a silent worker leaves the graph
    // pane spinning forever. The client turns this into a recoverable notice.
    const response: GraphLayoutWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
      layoutTime: performance.now() - start,
    };
    self.postMessage(response);
  }
};
