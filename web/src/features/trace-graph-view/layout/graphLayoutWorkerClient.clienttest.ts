import { type GraphCanvasData, type GraphNodeData } from "../types";
import { MAX_MAIN_THREAD_LAYOUT_NODES } from "./elkLayout";

const node = (id: string): GraphNodeData => ({ id, label: id, type: "AGENT" });

const graph: GraphCanvasData = {
  nodes: [node("a"), node("b")],
  edges: [
    { from: "a", to: "b" },
    { from: "a", to: "b" }, // deduped before the post
  ],
};

/** An ELK answer for `graph`, as elkjs's worker would post it back. */
const laidOut = (width: number) => ({
  id: "root",
  width,
  height: 128,
  children: [
    { id: "a", x: 0, y: 0, width: 96, height: 34 },
    { id: "b", x: 0, y: 94, width: 96, height: 34 },
  ],
  edges: [
    {
      id: "edge-0",
      sources: ["a"],
      targets: ["b"],
      sections: [{ startPoint: { x: 48, y: 34 }, endPoint: { x: 48, y: 94 } }],
    },
  ],
});

type ElkMessage = {
  id: number;
  cmd: string;
  graph?: { edges?: unknown[]; layoutOptions?: Record<string, string> };
};

/** Stands in for the bundled elkjs worker: same message protocol, no layout. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: ElkMessage[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: ElkMessage) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  get layoutRequests() {
    return this.posted.filter((m) => m.cmd === "layout");
  }

  answer(message: ElkMessage, data: unknown) {
    this.onmessage?.({ data: { id: message.id, data } } as MessageEvent);
  }

  fail(message: ElkMessage, error: unknown) {
    this.onmessage?.({ data: { id: message.id, error } } as MessageEvent);
  }
}

// The client keeps the worker in module state, so every test needs its own copy.
async function loadClient() {
  vi.resetModules();
  return import("./graphLayoutWorkerClient");
}

/** elk-api delivers worker answers through a 0ms timeout. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("requestGraphLayout", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves with the layout the worker sends back", async () => {
    const client = await loadClient();
    const pending = client.requestGraphLayout(graph, {}, "DOWN");
    const worker = FakeWorker.instances[0];
    await flush();

    const [request] = worker.layoutRequests;
    // Duplicate edges are deduped before the post — the payload stays minimal.
    expect(request.graph?.edges).toHaveLength(1);
    expect(request.graph?.layoutOptions?.["elk.direction"]).toBe("DOWN");

    worker.answer(request, laidOut(200));
    await expect(pending).resolves.toMatchObject({
      width: 200,
      edges: [{ source: "a", target: "b" }],
    });
  });

  it("drops a cancelled request's result instead of landing it on the next graph", async () => {
    const client = await loadClient();
    const controller = new AbortController();
    const stale = client
      .requestGraphLayout(graph, {}, "DOWN", controller.signal)
      .catch((error: Error) => error);
    const staleWorker = FakeWorker.instances[0];
    await flush();
    const [staleRequest] = staleWorker.layoutRequests;

    controller.abort();
    expect(await stale).toBeInstanceOf(client.GraphLayoutCancelledError);
    // Cancelling always kills the worker, however young the run is: ELK cannot be
    // interrupted, so anything left running would hold the one worker thread with
    // no deadline and starve the request that replaced it.
    expect(staleWorker.terminated).toBe(true);

    const fresh = client.requestGraphLayout(graph, {}, "RIGHT");
    const freshWorker = FakeWorker.instances[1];
    await flush();

    // A late answer from the killed worker must not become the current layout.
    staleWorker.answer(staleRequest, laidOut(1));
    freshWorker.answer(freshWorker.layoutRequests[0], laidOut(2));
    await expect(fresh).resolves.toMatchObject({ width: 2 });
  });

  it("gives up with the too-large notice when elkjs overflows the worker stack", async () => {
    const client = await loadClient();
    const pending = client.requestGraphLayout(graph, {}, "DOWN");
    const worker = FakeWorker.instances[0];
    await flush();

    worker.fail(worker.layoutRequests[0], "Maximum call stack size exceeded");

    await expect(pending).resolves.toMatchObject({
      tooLarge: true,
      nodeCount: 2,
      edgeCount: 1,
    });
  });

  it("gives up with the too-large notice when a layout blows the deadline", async () => {
    vi.useFakeTimers();
    const client = await loadClient();
    const pending = client.requestGraphLayout(graph, {}, "DOWN");
    const worker = FakeWorker.instances[0];

    vi.advanceTimersByTime(client.GRAPH_LAYOUT_DEADLINE_MS);

    await expect(pending).resolves.toMatchObject({
      tooLarge: true,
      nodeCount: 2,
      edgeCount: 1,
    });
    // ELK cannot be interrupted — the worker has to die for the layout to stop.
    expect(worker.terminated).toBe(true);
  });

  it("lays out on the calling thread when the browser has no Worker", async () => {
    vi.stubGlobal("Worker", undefined);
    const client = await loadClient();

    const layout = await client.requestGraphLayout(graph, {}, "DOWN");
    expect(layout.tooLarge).toBeFalsy();
    expect(layout.nodes).toHaveLength(2);
  });

  it("refuses a graph the main thread cannot afford when there is no Worker", async () => {
    // No deadline can apply to synchronous ELK, so the pre-worker counts are the
    // only protection on that path — refuse instead of freezing the tab.
    vi.stubGlobal("Worker", undefined);
    const client = await loadClient();
    const wide: GraphCanvasData = {
      nodes: Array.from({ length: MAX_MAIN_THREAD_LAYOUT_NODES + 1 }, (_, i) =>
        node(`n${i}`),
      ),
      edges: [{ from: "n0", to: "n1" }],
    };

    const started = Date.now();
    const layout = await client.requestGraphLayout(wide, {}, "DOWN");
    expect(Date.now() - started).toBeLessThan(1000); // ELK never ran
    expect(layout.tooLarge).toBe(true);
    expect(layout.nodeCount).toBe(MAX_MAIN_THREAD_LAYOUT_NODES + 1);
  });
});
