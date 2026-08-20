import { describe, it, expect } from "vitest";
import { MixpanelIntegrationProcessingQueue } from "./mixpanelIntegrationProcessingQueue";
import { BlobStorageIntegrationProcessingQueue } from "./blobStorageIntegrationProcessingQueue";

describe("analytics/blob storage processing queue attempts budget", () => {
  it("Mixpanel processing queue has a fixed 5-attempt budget", () => {
    const queue = MixpanelIntegrationProcessingQueue.getInstance();
    if (!queue) {
      throw new Error(
        "MixpanelIntegrationProcessingQueue.getInstance() returned null — no Redis connection available to assert defaultJobOptions against",
      );
    }
    expect(queue.opts.defaultJobOptions?.attempts).toBe(5);
  });

  it("Blob storage processing queue has a fixed 5-attempt budget", () => {
    const queue = BlobStorageIntegrationProcessingQueue.getInstance();
    if (!queue) {
      throw new Error(
        "BlobStorageIntegrationProcessingQueue.getInstance() returned null — no Redis connection available to assert defaultJobOptions against",
      );
    }
    expect(queue.opts.defaultJobOptions?.attempts).toBe(5);
  });
});
