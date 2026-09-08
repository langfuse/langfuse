import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeWorkerHandle = {
  emit: (event: string, ...args: unknown[]) => boolean;
};

// Shared with the mock factory below; survives vi.resetModules().
const fakeWorkers = vi.hoisted(() => ({
  instances: [] as FakeWorkerHandle[],
}));

// Stand in for worker_threads so the pool lifecycle is observable without
// spawning real threads (the real script needs the compiled dist).
vi.mock("worker_threads", async () => {
  const { EventEmitter } = await import("events");

  class FakeWorker extends EventEmitter {
    postMessage = vi.fn();

    constructor(public readonly file: string) {
      super();
      fakeWorkers.instances.push(this);
    }

    // Node reports exit code 1 for a worker thread stopped via terminate().
    async terminate(): Promise<number> {
      this.emit("exit", 1);
      return 1;
    }
  }

  return { Worker: FakeWorker };
});

// Fresh module registry per test because the manager is a module singleton.
const load = async () => {
  const { getTokenCountWorkerManager } =
    await import("../features/tokenisation/async-usage");
  const { logger } = await import("@langfuse/shared/src/server");
  fakeWorkers.instances.length = 0;
  const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
  return { getTokenCountWorkerManager, errorSpy };
};

describe("TokenCountWorkerManager", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("terminate() stops the pool without logging errors or respawning threads", async () => {
    const { getTokenCountWorkerManager, errorSpy } = await load();
    const manager = getTokenCountWorkerManager(2);
    expect(fakeWorkers.instances).toHaveLength(2);

    await manager.terminate();

    expect(fakeWorkers.instances).toHaveLength(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("replaces a thread that exits unexpectedly and logs the exit", async () => {
    const { getTokenCountWorkerManager, errorSpy } = await load();
    getTokenCountWorkerManager(2);

    fakeWorkers.instances[0].emit("exit", 1);

    expect(fakeWorkers.instances).toHaveLength(3);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects tokenCount() once the pool has been terminated", async () => {
    const { getTokenCountWorkerManager } = await load();
    const manager = getTokenCountWorkerManager(1);
    await manager.terminate();

    await expect(
      manager.tokenCount({ model: {} as never, text: "hello" }),
    ).rejects.toThrow(/terminat/i);
  });
});
