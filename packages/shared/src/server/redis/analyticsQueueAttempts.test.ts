import { describe, it, expect } from "vitest";
import { MixpanelIntegrationProcessingQueue } from "./mixpanelIntegrationProcessingQueue";
import { BlobStorageIntegrationProcessingQueue } from "./blobStorageIntegrationProcessingQueue";

// Pins the one BullMQ setting standing between "the fail-closed final-attempt
// gate (bullmqAttempts.ts) means anything" and "it silently stops mattering
// because someone tidied a queue's defaultJobOptions" — both the Mixpanel and
// blob storage processing queues must keep a bounded, known attempts budget so
// job.opts.attempts is always a number the gate can compare against.
describe("analytics/blob storage processing queue attempts budget", () => {
  it("Mixpanel processing queue has a fixed 5-attempt budget", () => {
    const queue = MixpanelIntegrationProcessingQueue.getInstance();
    // A null instance means no Redis connection was available to this test
    // run, not that the budget is unset — skip only in that infra case rather
    // than reporting a false pass.
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
