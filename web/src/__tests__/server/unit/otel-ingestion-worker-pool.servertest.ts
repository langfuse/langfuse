import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";
import type { NextApiResponse } from "next";

import {
  acquireOtelIngestionWorker,
  createOtelIngestionWorkerLease,
  getTransferableOtelBody,
} from "@/src/server/otel/otelIngestionWorkerPool";

describe("OTel ingestion worker pool", () => {
  it("returns a cloneable JSON representation of a BullMQ job", async () => {
    const toKey = (() => "job-key").bind({});
    const originalJob = {
      id: "job-id",
      data: { type: "otel" },
      toKey,
    };
    const processOtelIngestion = vi.fn().mockResolvedValue({
      kind: "ok",
      body: { toJSON: () => originalJob },
    });
    vi.doMock("@/src/server/otel/processOtelIngestion", () => ({
      processOtelIngestion,
    }));

    try {
      const { default: processOtelIngestionInWorker } =
        await import("@/src/server/otel/otelIngestionWorker");
      const result = await processOtelIngestionInWorker({
        body: new Uint8Array(new ArrayBuffer(0)),
        encodedBodyBytes: 0,
        contentType: "application/json",
        config: {
          projectId: "project-id",
          publicKey: "public-key",
          sdkName: "test-sdk",
          sdkVersion: "1.0.0",
        },
      });

      expect(() => structuredClone(result)).not.toThrow();
      expect(JSON.stringify(result.body)).toBe(JSON.stringify(originalJob));
    } finally {
      vi.doUnmock("@/src/server/otel/processOtelIngestion");
      vi.resetModules();
    }
  });

  it("resumes a paused request before reading a leased body", async () => {
    const req = new PassThrough() as PassThrough &
      IncomingMessage & {
        headers: Record<string, string>;
      };
    req.headers = { "content-length": "4" };

    const res = new EventEmitter() as EventEmitter & {
      status: (statusCode: number) => void;
      setHeader: (name: string, value: unknown) => void;
    };
    res.status = () => {};
    res.setHeader = () => {};

    const leaseResult = await createOtelIngestionWorkerLease(
      req,
      res as unknown as NextApiResponse,
      "project-id",
    );
    if (!("lease" in leaseResult)) {
      req.destroy();
      throw new Error("Expected to acquire an OTel ingestion worker lease");
    }

    const bodyPromise = leaseResult.lease.readBody(4);
    try {
      expect(req.isPaused()).toBe(false);
      req.end("body");
      await expect(bodyPromise).resolves.toEqual({
        body: Buffer.from("body"),
      });
    } finally {
      req.emit("aborted");
      await bodyPromise.catch(() => undefined);
      req.destroy();
    }
  });

  it("admits one waiter and rejects a third request as busy", async () => {
    const firstController = new AbortController();
    const waiterController = new AbortController();
    const nextController = new AbortController();
    const firstAdmission = await acquireOtelIngestionWorker(
      firstController.signal,
    );
    expect(firstAdmission.kind).toBe("acquired");
    if (firstAdmission.kind !== "acquired") return;

    const waiterAdmission = acquireOtelIngestionWorker(waiterController.signal);
    const busyAdmission = await acquireOtelIngestionWorker(
      nextController.signal,
    );
    expect(busyAdmission.kind).toBe("busy");

    let waiterAcquired = false;
    const waiterResult = waiterAdmission.then((admission) => {
      waiterAcquired = admission.kind === "acquired";
      return admission;
    });
    await Promise.resolve();
    expect(waiterAcquired).toBe(false);

    firstAdmission.release();
    const nextAdmission = await waiterResult;
    expect(nextAdmission.kind).toBe("acquired");
    if (nextAdmission.kind === "acquired") nextAdmission.release();
  });

  it("removes an aborted waiter so a later request can wait", async () => {
    const firstController = new AbortController();
    const abortedController = new AbortController();
    const nextController = new AbortController();
    const firstAdmission = await acquireOtelIngestionWorker(
      firstController.signal,
    );
    expect(firstAdmission.kind).toBe("acquired");
    if (firstAdmission.kind !== "acquired") return;

    const abortedAdmission = acquireOtelIngestionWorker(
      abortedController.signal,
    );
    abortedController.abort();
    await expect(abortedAdmission).resolves.toMatchObject({ kind: "aborted" });

    const nextAdmission = acquireOtelIngestionWorker(nextController.signal);
    let nextAcquired = false;
    const nextResult = nextAdmission.then((admission) => {
      nextAcquired = admission.kind === "acquired";
      return admission;
    });
    await Promise.resolve();
    expect(nextAcquired).toBe(false);

    firstAdmission.release();
    const acquiredNext = await nextResult;
    expect(acquiredNext.kind).toBe("acquired");
    if (acquiredNext.kind === "acquired") acquiredNext.release();
  });

  it("hands the permit off exactly once", async () => {
    const firstController = new AbortController();
    const nextController = new AbortController();
    const laterController = new AbortController();
    const firstAdmission = await acquireOtelIngestionWorker(
      firstController.signal,
    );
    expect(firstAdmission.kind).toBe("acquired");
    if (firstAdmission.kind !== "acquired") return;

    const nextResult = acquireOtelIngestionWorker(nextController.signal);
    await Promise.resolve();
    firstAdmission.release();
    const nextAdmission = await nextResult;
    expect(nextAdmission.kind).toBe("acquired");
    if (nextAdmission.kind !== "acquired") return;

    firstAdmission.release();

    let laterAcquired = false;
    const laterResult = acquireOtelIngestionWorker(laterController.signal).then(
      (admission) => {
        laterAcquired = admission.kind === "acquired";
        return admission;
      },
    );
    await Promise.resolve();
    expect(laterAcquired).toBe(false);

    nextAdmission.release();
    const acquiredLater = await laterResult;
    expect(acquiredLater.kind).toBe("acquired");
    if (acquiredLater.kind === "acquired") acquiredLater.release();
  });

  it("copies sliced buffers but keeps standalone buffers transferable", () => {
    const standalone = Buffer.allocUnsafeSlow(4);
    const sliced = Buffer.allocUnsafeSlow(8).subarray(2, 6);

    expect(getTransferableOtelBody(standalone)).toBe(standalone);

    const transferableSlice = getTransferableOtelBody(sliced);
    expect(transferableSlice).not.toBe(sliced);
    expect(transferableSlice.buffer).not.toBe(sliced.buffer);
    expect(transferableSlice).toEqual(sliced);
  });
});
