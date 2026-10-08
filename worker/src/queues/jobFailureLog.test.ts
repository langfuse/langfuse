import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  traceException: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const { isS3SlowDownError } =
    await import("../../../packages/shared/src/server/services/s3ThrottleError");
  return {
    logger: {
      warn: mocks.warn,
      error: mocks.error,
    },
    traceException: mocks.traceException,
    isS3SlowDownError,
  };
});

import {
  exceedsNonSlowDownAttemptBudget,
  logRetryableJobFailure,
} from "./jobFailureLog";

function slowDown(): Error {
  const cause = Object.assign(new Error("Please reduce your request rate."), {
    name: "SlowDown",
  });
  return new Error("Failed to download file from S3", { cause });
}

describe("logRetryableJobFailure", () => {
  beforeEach(() => {
    mocks.warn.mockClear();
    mocks.error.mockClear();
    mocks.traceException.mockClear();
  });

  it("warns on SlowDown while BullMQ retries remain", () => {
    logRetryableJobFailure({
      message: "ingestion failed",
      error: slowDown(),
      job: { attemptsMade: 0, opts: { attempts: 6 } },
    });

    expect(mocks.warn).toHaveBeenCalledWith(
      "ingestion failed",
      expect.any(Error),
    );
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.traceException).not.toHaveBeenCalled();
  });

  it("errors on SlowDown once the processor is on its last attempt", () => {
    logRetryableJobFailure({
      message: "ingestion failed",
      error: slowDown(),
      job: { attemptsMade: 5, opts: { attempts: 6 } },
    });

    expect(mocks.error).toHaveBeenCalledWith(
      "ingestion failed",
      expect.any(Error),
    );
    expect(mocks.traceException).toHaveBeenCalledOnce();
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it("treats attemptsMade as already incremented in the worker failed handler", () => {
    logRetryableJobFailure({
      message: "queue job failed",
      error: slowDown(),
      job: { attemptsMade: 1, opts: { attempts: 6 } },
      attemptsIncludeCurrentFailure: true,
    });
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(mocks.error).not.toHaveBeenCalled();

    mocks.warn.mockClear();
    logRetryableJobFailure({
      message: "queue job failed",
      error: slowDown(),
      job: { attemptsMade: 6, opts: { attempts: 6 } },
      attemptsIncludeCurrentFailure: true,
    });
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(mocks.traceException).toHaveBeenCalledOnce();
  });

  it("still errors immediately for a non-throttle failure", () => {
    logRetryableJobFailure({
      message: "ingestion failed",
      error: new Error("NoSuchKey"),
      job: { attemptsMade: 0, opts: { attempts: 6 } },
    });

    expect(mocks.error).toHaveBeenCalledOnce();
    expect(mocks.traceException).toHaveBeenCalledOnce();
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it("keeps the error's message and stack next to extra fields", () => {
    const cause = new Error("socket hang up");
    const error = new Error("NoSuchKey", { cause });
    logRetryableJobFailure({
      message: "ingestion failed",
      error,
      job: { attemptsMade: 0, opts: { attempts: 6 } },
      fields: { projectId: "project-1" },
    });

    // Winston's JSON format serialises an Error nested under a key as `{}`.
    const payload = mocks.error.mock.calls[0][1];
    expect(payload).not.toHaveProperty("error");
    expect(payload).toMatchObject({
      message: "NoSuchKey",
      stack: error.stack,
      cause,
      projectId: "project-1",
    });
  });
});

describe("exceedsNonSlowDownAttemptBudget", () => {
  const job = (attemptsMade: number) => ({
    attemptsMade,
    opts: { attempts: 8 },
  });

  it("allows non-throttle failures to retry until the budget's last attempt", () => {
    expect(
      exceedsNonSlowDownAttemptBudget(job(3), new Error("NoSuchKey"), 5),
    ).toBe(false);
    expect(
      exceedsNonSlowDownAttemptBudget(job(4), new Error("NoSuchKey"), 5),
    ).toBe(true);
  });

  it("never caps SlowDown, which keeps the full queue budget", () => {
    expect(exceedsNonSlowDownAttemptBudget(job(6), slowDown(), 5)).toBe(false);
  });
});
