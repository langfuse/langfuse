import { describe, expect, it, vi, beforeEach } from "vitest";
import { type Model } from "@langfuse/shared";

// Stand in for a real worker_threads Worker so the pool spins up without
// spawning threads. postMessage echoes a successful result synchronously
// while `autoRespond` is set, which is enough to prove the live path
// resolves; disabling it leaves a request in flight so the shutdown drop
// can be observed. Hoisted so the vi.mock factory can close over the class,
// the instance registry, and the response toggle.
const { workerInstances, FakeWorker, control, recordIncrement } = vi.hoisted(
  () => {
    const instances: any[] = [];
    const control = { autoRespond: true };
    const recordIncrement = vi.fn();
    class FakeWorker {
      handlers: Record<string, (arg: any) => void> = {};
      postMessage = vi.fn((msg: { id: string }) => {
        if (control.autoRespond) {
          this.handlers["message"]?.({ id: msg.id, result: 7, error: null });
        }
      });
      terminate = vi.fn(async () => {});
      constructor() {
        instances.push(this);
      }
      on(event: string, cb: (arg: any) => void) {
        this.handlers[event] = cb;
      }
    }
    return { workerInstances: instances, FakeWorker, control, recordIncrement };
  },
);

vi.mock("worker_threads", () => ({ Worker: FakeWorker }));
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  recordIncrement,
}));
vi.mock("../env", () => ({
  env: { LANGFUSE_TOKEN_COUNT_WORKER_POOL_SIZE: 2 },
}));

import { TokenCountWorkerManager } from "../features/tokenisation/async-usage";

const model = { id: "m", tokenizerId: "openai" } as unknown as Model;

const totalPostMessages = () =>
  workerInstances.reduce((n, w) => n + w.postMessage.mock.calls.length, 0);

describe("TokenCountWorkerManager shutdown guard", () => {
  beforeEach(() => {
    workerInstances.length = 0;
    control.autoRespond = true;
    recordIncrement.mockClear();
  });

  it("returns the worker result while the pool is live", async () => {
    const manager = new TokenCountWorkerManager(2);

    await expect(manager.tokenCount({ model, text: "hi" })).resolves.toBe(7);
  });

  it("drops the count instead of throwing once the pool is terminated", async () => {
    const manager = new TokenCountWorkerManager(2);
    await manager.terminate();

    const postsBefore = totalPostMessages();
    await expect(
      manager.tokenCount({ model, text: "hi" }),
    ).resolves.toBeUndefined();
    expect(totalPostMessages()).toBe(postsBefore);
  });

  it("resolves in-flight requests as undefined and records one summary metric on terminate", async () => {
    const manager = new TokenCountWorkerManager(2);
    control.autoRespond = false;

    const inFlight = manager.tokenCount({ model, text: "hi" });
    await manager.terminate();

    await expect(inFlight).resolves.toBeUndefined();
    expect(recordIncrement).toHaveBeenCalledTimes(1);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.tokenisation.skipped_on_shutdown",
      1,
    );
  });

  it("does not record the shutdown metric when nothing is in flight", async () => {
    const manager = new TokenCountWorkerManager(2);
    await manager.terminate();

    expect(recordIncrement).not.toHaveBeenCalled();
  });
});
