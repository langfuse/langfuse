import { describe, it, expect, vi } from "vitest";

const constructed: { name: string; opts: any }[] = [];

vi.mock("bullmq", () => ({
  Queue: class {
    opts: any;
    on = vi.fn();
    constructor(name: string, opts: any) {
      this.opts = opts;
      constructed.push({ name, opts });
    }
  },
}));

vi.mock("./redis", () => ({
  createBullMQQueueOptionsWithRedis: vi.fn(() => ({
    connection: {},
    prefix: "test",
  })),
}));

import { MixpanelIntegrationProcessingQueue } from "./mixpanelIntegrationProcessingQueue";
import { BlobStorageIntegrationProcessingQueue } from "./blobStorageIntegrationProcessingQueue";

describe("analytics/blob storage processing queue attempts budget", () => {
  it("Mixpanel processing queue has a fixed 5-attempt budget", () => {
    const queue = MixpanelIntegrationProcessingQueue.getInstance();
    expect((queue as any)?.opts.defaultJobOptions?.attempts).toBe(5);
  });

  it("Blob storage processing queue has a fixed 5-attempt budget", () => {
    const queue = BlobStorageIntegrationProcessingQueue.getInstance();
    expect((queue as any)?.opts.defaultJobOptions?.attempts).toBe(5);
  });
});
