import { expect, it, vi } from "vitest";

const { env, createQueueOptions, queueCreated } = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined as string | undefined,
    LANGFUSE_TRACE_BATCH_INGESTION_ENABLED: "true",
    LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED: "true",
    QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED: "true",
    LANGFUSE_TRACE_BATCH_READ_ENABLED: "true",
  },
  createQueueOptions: vi.fn(() => ({ connection: {} })),
  queueCreated: vi.fn(),
}));

vi.mock("../../env", () => ({ env }));
vi.mock("./redis", () => ({
  createBullMQQueueOptionsWithRedis: createQueueOptions,
}));
vi.mock("../logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("bullmq", () => ({
  Queue: class {
    constructor() {
      queueCreated();
    }
    on = vi.fn();
  },
}));

import { TraceBatchQueue } from "./traceBatch";

it("keeps queue inspection inert outside cloud even with all experiment flags enabled", () => {
  expect(TraceBatchQueue.getInstance()).toBeNull();
  expect(createQueueOptions).not.toHaveBeenCalled();
  expect(queueCreated).not.toHaveBeenCalled();

  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  const cloudQueue = TraceBatchQueue.getInstance();
  expect(cloudQueue).not.toBeNull();
  expect(TraceBatchQueue.getInstance()).toBe(cloudQueue);
  expect(queueCreated).toHaveBeenCalledTimes(1);

  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  expect(TraceBatchQueue.getInstance()).toBeNull();
  expect(queueCreated).toHaveBeenCalledTimes(1);
});
