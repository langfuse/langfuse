import { describe, expect, it } from "vitest";

import {
  acquireOtelIngestionWorker,
  getTransferableOtelBody,
} from "@/src/server/otel/otelIngestionWorkerPool";

describe("OTel ingestion worker pool", () => {
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
