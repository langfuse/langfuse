import { beforeEach, describe, expect, it, vi } from "vitest";

import { OtelIngestionEvent } from "../queues";
// vi.mock calls are hoisted above this import, so the processor picks up the
// mocked S3 and queue modules.
import { OtelIngestionProcessor } from "./OtelIngestionProcessor";

const uploadJson = vi.fn().mockResolvedValue(undefined);
const queueAdd = vi.fn().mockResolvedValue(undefined);

// The processor reaches getS3EventStorageClient through the server barrel;
// mocking the owning ./s3 module leaves the rest of the barrel intact.
vi.mock("../s3", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../s3")>()),
  getS3EventStorageClient: () => ({ uploadJson }),
}));

vi.mock("../redis/otelIngestionQueue", () => ({
  OtelIngestionQueue: { getInstance: () => ({ add: queueAdd }) },
}));

const RESOURCE_SPANS = [
  {
    resource: { attributes: [] },
    scopeSpans: [{ scope: { name: "custom-exporter" }, spans: [] }],
  },
];

/**
 * The queue payload is the whole contract between the web producer, which owns
 * the Cloud OTel direct-write cutoff decision, and the worker consumer, which
 * routes the batch. An HTTP-level test cannot cover it: the cutoff is read from
 * the web process's own env, so the flag has to be pinned here.
 */
const publishWith = async (
  config: Partial<{ forceDirectWrite: boolean; ingestionVersion: string }>,
) => {
  await new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "pk-lf-1234567890",
    orgId: "org-1",
    sdkName: "unknown",
    sdkVersion: "unknown",
    ...config,
  }).publishToOtelIngestionQueue(RESOURCE_SPANS as never);

  expect(queueAdd).toHaveBeenCalledTimes(1);
  // Parse through the shared schema rather than asserting the raw object, so a
  // payload the consumer would reject fails here.
  return OtelIngestionEvent.parse(queueAdd.mock.calls[0][1].payload);
};

describe("publishToOtelIngestionQueue forceDirectWrite", () => {
  beforeEach(() => {
    uploadJson.mockClear();
    queueAdd.mockClear();
  });

  it("carries the flag when the organization is past the cutoff", async () => {
    const payload = await publishWith({ forceDirectWrite: true });

    expect(payload.forceDirectWrite).toBe(true);
  });

  // Omitted rather than false, matching how isLangfuseInternal is handled: the
  // consumer treats absence as "not forced", and every in-flight job enqueued
  // before the flag existed must keep parsing.
  it("omits the flag when the organization is not in scope", async () => {
    const payload = await publishWith({ forceDirectWrite: false });

    expect(payload.forceDirectWrite).toBeUndefined();
  });

  it("omits the flag when the producer does not resolve the cutoff at all", async () => {
    const payload = await publishWith({});

    expect(payload.forceDirectWrite).toBeUndefined();
  });

  // The flag is independent of the header signal; a batch can carry both.
  it("carries the flag alongside an explicit ingestion version", async () => {
    const payload = await publishWith({
      forceDirectWrite: true,
      ingestionVersion: "4",
    });

    expect(payload).toMatchObject({
      forceDirectWrite: true,
      ingestionVersion: "4",
    });
  });
});
