import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";

import type { NextApiResponse } from "next";
import { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import {
  createOtelIngestionWorkerContext,
  getTransferableOtelBody,
  type OtelIngestionWorkerContext,
  type OtelIngestionWorkerContextResult,
} from "@/src/server/otel/otelIngestionWorkerContext";
import { tryScheduleOtelIngestionWorkerLifecycle } from "@/src/server/otel/otelIngestionWorkerPool";

function deferred() {
  return Promise.withResolvers<void>();
}

describe("OTel ingestion worker admission", () => {
  it("runs one lifecycle, queues one, and rejects a third", async () => {
    const firstRelease = deferred();
    const secondRelease = deferred();
    const started: string[] = [];

    const first = tryScheduleOtelIngestionWorkerLifecycle(async () => {
      started.push("first");
      await firstRelease.promise;
    });
    await vi.waitFor(() => expect(started).toEqual(["first"]));

    const second = tryScheduleOtelIngestionWorkerLifecycle(async () => {
      started.push("second");
      await secondRelease.promise;
    });
    const third = tryScheduleOtelIngestionWorkerLifecycle(async () => {});

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeUndefined();
    expect(started).toEqual(["first"]);

    firstRelease.resolve();
    await first;
    await vi.waitFor(() => expect(started).toEqual(["first", "second"]));
    secondRelease.resolve();
    await second;
  });

  it("removes an aborted waiter so its queue slot can be reused", async () => {
    const firstRelease = deferred();
    const first = tryScheduleOtelIngestionWorkerLifecycle(
      async () => firstRelease.promise,
    );
    const abortController = new AbortController();
    let abortedTaskStarted = false;
    const aborted = tryScheduleOtelIngestionWorkerLifecycle(async () => {
      abortedTaskStarted = true;
    }, abortController.signal);

    abortController.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });

    let nextTaskStarted = false;
    const next = tryScheduleOtelIngestionWorkerLifecycle(async () => {
      nextTaskStarted = true;
    });
    expect(next).toBeDefined();

    firstRelease.resolve();
    await first;
    await next;
    expect(abortedTaskStarted).toBe(false);
    expect(nextTaskStarted).toBe(true);
  });
});

type TestRequest = PassThrough &
  IncomingMessage & {
    headers: Record<string, string>;
  };

type TestResponse = EventEmitter & {
  status: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
};

type TestContext = {
  req: TestRequest;
  res: TestResponse;
  result: Promise<OtelIngestionWorkerContextResult>;
};

function createContext(
  headers: Record<string, string> = {},
  maxBodyBytes = 64,
): TestContext {
  const req = new PassThrough() as TestRequest;
  req.headers = headers;
  req.complete = true;
  const res = new EventEmitter() as TestResponse;
  res.status = vi.fn();
  res.setHeader = vi.fn();
  return {
    req,
    res,
    result: createOtelIngestionWorkerContext(
      req,
      res as unknown as NextApiResponse,
      "project-id",
      maxBodyBytes,
    ),
  };
}

function finish(...contexts: TestContext[]) {
  for (const { req, res } of contexts) {
    res.emit("finish");
    req.destroy();
  }
}

function expectContext(
  result: OtelIngestionWorkerContextResult,
): OtelIngestionWorkerContext {
  if ("response" in result) {
    throw new Error("Expected to acquire an OTel ingestion worker context");
  }

  return result;
}

describe("OTel ingestion worker request context", () => {
  it("keeps one waiting body unread and maps exhausted admission to 503", async () => {
    const first = createContext();
    const queued = createContext();
    queued.req.write("queued body");
    expect(queued.req.isPaused()).toBe(true);
    expect(queued.req.readableLength).toBeGreaterThan(0);

    const third = createContext();
    try {
      await expect(third.result).resolves.toEqual({
        response: { error: "OTel ingestion worker is busy" },
      });
      expect(third.res.status).toHaveBeenCalledWith(503);
      expect(third.res.setHeader).toHaveBeenCalledWith("Retry-After", 1);
      expect(third.res.setHeader).toHaveBeenCalledWith("Connection", "close");

      first.req.end("body");
      expect(expectContext(await first.result).body).toEqual(
        Buffer.from("body"),
      );
      first.res.emit("finish");

      queued.req.end();
      expect(expectContext(await queued.result).body).toEqual(
        Buffer.from("queued body"),
      );
      queued.res.emit("finish");
    } finally {
      finish(first, queued, third);
    }
  });

  it("forwards a queued request abort so admission can be reused", async () => {
    const first = createContext({}, 4);
    const queued = createContext({}, 4);
    queued.req.write("queued body");
    queued.req.emit("aborted");
    await expect(queued.result).resolves.toEqual({ response: {} });
    expect(queued.req.readableLength).toBeGreaterThan(0);

    const next = createContext({}, 4);
    try {
      first.req.end("body");
      expect(expectContext(await first.result).body).toEqual(
        Buffer.from("body"),
      );
      first.res.emit("finish");

      next.req.end("next");
      expect(expectContext(await next.result).body).toEqual(
        Buffer.from("next"),
      );
      next.res.emit("finish");
    } finally {
      finish(first, queued, next);
    }
  });

  it("holds admission after a body error until the response finishes", async () => {
    const first = createContext({ "content-length": "5" }, 4);
    let next: TestContext | undefined;
    try {
      first.req.end("12345");
      await expect(first.result).rejects.toMatchObject({
        name: "OtelRequestBodyTooLargeError",
      });

      next = createContext({ "content-length": "4" }, 4);
      let nextSettled = false;
      const nextObservation = next.result.then(() => {
        nextSettled = true;
      });
      await Promise.resolve();
      expect(nextSettled).toBe(false);

      first.res.emit("finish");
      next.req.end("next");
      expect(expectContext(await next.result).body).toEqual(
        Buffer.from("next"),
      );
      await nextObservation;
    } finally {
      finish(first);
      if (next) finish(next);
    }
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

describe("OTel ingestion worker result", () => {
  it("returns a cloneable JSON representation of a BullMQ job", async () => {
    const originalJob = new Job(
      {
        toKey: (key: string) => `bull:test:${key}`,
        qualifiedName: "bull:test",
        keys: {},
        opts: {},
        client: Promise.resolve({}),
        closing: undefined,
        redisVersion: "7.0.0",
        databaseType: "redis",
      } as never,
      "otel",
      { type: "otel" },
      {},
      "job-id",
    );
    const processOtelIngestion = vi.fn().mockResolvedValue({
      kind: "ok",
      body: originalJob,
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
      if (result.kind !== "ok") {
        throw new Error(`Unexpected worker result: ${result.kind}`);
      }
      expect(JSON.stringify(result.body)).toBe(JSON.stringify(originalJob));
    } finally {
      vi.doUnmock("@/src/server/otel/processOtelIngestion");
      vi.resetModules();
    }
  });
});
