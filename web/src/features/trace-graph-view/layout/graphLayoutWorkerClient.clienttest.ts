import { type GraphCanvasData, type GraphNodeData } from "../types";
import type { GraphLayout } from "./elkLayout";

const node = (id: string): GraphNodeData => ({ id, label: id, type: "AGENT" });

const graph: GraphCanvasData = {
  nodes: [node("a"), node("b")],
  edges: [{ from: "a", to: "b" }],
};

const positioned = (width: number): GraphLayout => ({
  nodes: [{ id: "a", x: 0, y: 0, width: 96, height: 34 }],
  edges: [],
  width,
  height: 34,
});

type PostedMessage = { id: string; request: unknown };

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: PostedMessage[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: PostedMessage) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  respond(id: string, layout: GraphLayout) {
    this.onmessage?.({
      data: { id, layout, layoutTime: 1 },
    } as MessageEvent);
  }
}

// The client keeps the worker in module state, so every test needs its own copy.
async function loadClient() {
  vi.resetModules();
  return import("./graphLayoutWorkerClient");
}

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

    // Only primitives cross the boundary, and edges are deduped before the post.
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]).toMatchObject({
      request: { direction: "DOWN", edges: [{ from: "a", to: "b" }] },
    });

    worker.respond(worker.posted[0].id, positioned(200));
    await expect(pending).resolves.toMatchObject({ width: 200 });
  });

  it("drops a cancelled request's result instead of landing it on the next graph", async () => {
    const client = await loadClient();
    const controller = new AbortController();
    const stale = client
      .requestGraphLayout(graph, {}, "DOWN", controller.signal)
      .catch((error: Error) => error);
    controller.abort();
    expect(await stale).toBeInstanceOf(client.GraphLayoutCancelledError);

    const fresh = client.requestGraphLayout(graph, {}, "RIGHT");
    const worker = FakeWorker.instances[0];
    const [staleMessage, freshMessage] = worker.posted;

    // The stale answer arrives first — it must not become the current layout.
    worker.respond(staleMessage.id, positioned(1));
    worker.respond(freshMessage.id, positioned(2));
    await expect(fresh).resolves.toMatchObject({ width: 2 });
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
});
