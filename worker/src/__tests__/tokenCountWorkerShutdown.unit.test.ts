import { describe, expect, it, vi, beforeEach } from "vitest";
import { type Model } from "@langfuse/shared";

// Stand in for a real worker_threads Worker so the pool spins up without
// spawning threads. postMessage echoes a successful result synchronously,
// which is enough to prove the live path still resolves. Hoisted so the
// vi.mock factory can close over both the class and the instance registry.
const { workerInstances, FakeWorker } = vi.hoisted(() => {
  const instances: any[] = [];
  class FakeWorker {
    handlers: Record<string, (arg: any) => void> = {};
    postMessage = vi.fn((msg: { id: string }) => {
      this.handlers["message"]?.({ id: msg.id, result: 7, error: null });
    });
    terminate = vi.fn(async () => {});
    constructor() {
      instances.push(this);
    }
    on(event: string, cb: (arg: any) => void) {
      this.handlers[event] = cb;
    }
  }
  return { workerInstances: instances, FakeWorker };
});

vi.mock("worker_threads", () => ({ Worker: FakeWorker }));
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
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
});
