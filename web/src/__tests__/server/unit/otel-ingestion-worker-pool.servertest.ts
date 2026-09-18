import { EventEmitter, once } from "node:events";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { PassThrough } from "node:stream";

import type { NextApiResponse } from "next";
import { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { logger } from "@langfuse/shared/src/server";

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

function bounded<T>(promise: Promise<T>, timeoutMs = 250): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Promise did not settle within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function settle(promise?: Promise<unknown>) {
  return bounded(promise?.catch(() => undefined) ?? Promise.resolve()).catch(
    () => undefined,
  );
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

function createHttpPair() {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.headers = {};
  const res = new ServerResponse(req);
  return { req, res, socket };
}

describe("OTel ingestion worker request context", () => {
  it("returns empty before admission for a closed request or response", async () => {
    const closePair = [
      async (pair: ReturnType<typeof createHttpPair>) => {
        Object.defineProperty(pair.req, "readable", { value: false });
      },
      async (pair: ReturnType<typeof createHttpPair>) => {
        const closed = once(pair.req, "close");
        pair.req.destroy();
        await closed;
      },
      async (pair: ReturnType<typeof createHttpPair>) => {
        pair.res.end();
        pair.res.emit("finish");
      },
    ];

    for (const close of closePair) {
      const firstRelease = deferred();
      const firstStarted = deferred();
      const first = tryScheduleOtelIngestionWorkerLifecycle(async () => {
        firstStarted.resolve();
        await firstRelease.promise;
      });
      expect(first).toBeDefined();
      await bounded(firstStarted.promise);

      const pair = createHttpPair();
      let contextResult: Promise<OtelIngestionWorkerContextResult> | undefined;
      let queued: Promise<void> | undefined;
      let overflow: Promise<void> | undefined;
      try {
        await close(pair);
        contextResult = createOtelIngestionWorkerContext(
          pair.req,
          pair.res as unknown as NextApiResponse,
          "project-id",
          64,
        );
        await expect(bounded(contextResult)).resolves.toEqual({
          response: {},
        });

        queued = tryScheduleOtelIngestionWorkerLifecycle(async () => {});
        overflow = tryScheduleOtelIngestionWorkerLifecycle(async () => {});
        expect(queued).toBeDefined();
        expect(overflow).toBeUndefined();
      } finally {
        pair.res.emit("close");
        pair.req.destroy();
        pair.socket.destroy();
        firstRelease.resolve();
        await Promise.all([
          settle(first),
          settle(contextResult),
          settle(queued),
          settle(overflow),
        ]);
      }
    }
  });

  it("returns 408 on a body read deadline without aborting the request", async () => {
    const realTimeout = AbortSignal.timeout;
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() =>
      realTimeout.call(AbortSignal, 20),
    );
    const pair = createHttpPair();
    const nextResponse = pair.res as typeof pair.res & NextApiResponse;
    nextResponse.status = (statusCode: number) => {
      pair.res.statusCode = statusCode;
      return nextResponse;
    };
    const warning = vi.spyOn(logger, "warn");
    let contextResult: Promise<OtelIngestionWorkerContextResult> | undefined;
    let next: Promise<void> | undefined;

    try {
      contextResult = createOtelIngestionWorkerContext(
        pair.req,
        nextResponse,
        "project-id",
        64,
      );
      pair.req.push("partial");
      await expect(bounded(contextResult)).resolves.toEqual({
        response: { error: "Request body read timed out" },
      });
      expect(pair.res.statusCode).toBe(408);
      expect(pair.req.destroyed).toBe(false);
      expect(warning).toHaveBeenCalledWith(
        "OTel request body read timed out",
        expect.objectContaining({ projectId: "project-id" }),
      );

      pair.res.emit("finish");
      next = tryScheduleOtelIngestionWorkerLifecycle(async () => {});
      expect(next).toBeDefined();
      await bounded(next!);
    } finally {
      pair.res.emit("finish");
      pair.req.destroy();
      pair.socket.destroy();
      await Promise.all([settle(contextResult), settle(next)]);
      vi.restoreAllMocks();
    }
  });

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

describe("OTel ingestion worker preload", () => {
  it("reuses the preloaded pool across server bundle instances", async () => {
    vi.resetModules();
    const run = vi.fn().mockResolvedValue({ kind: "warmup" });
    const PiscinaMock = vi.fn().mockImplementation(function () {
      return { on: vi.fn(), run };
    });
    vi.doMock("node:fs", () => ({ existsSync: () => true }));
    vi.doMock("piscina", () => ({ default: PiscinaMock }));

    try {
      const instrumentationBundle =
        await import("@/src/server/otel/otelIngestionWorkerPool");
      await instrumentationBundle.preloadOtelIngestionWorker();

      vi.resetModules();
      const routeBundle =
        await import("@/src/server/otel/otelIngestionWorkerPool");
      await routeBundle.dispatchOtelIngestionWorkerTask({ type: "warmup" });

      expect(PiscinaMock).toHaveBeenCalledOnce();
      expect(run).toHaveBeenCalledTimes(2);
    } finally {
      delete (globalThis as typeof globalThis & Record<symbol, unknown>)[
        Symbol.for("langfuse.otelIngestionWorker.runtime")
      ];
      vi.doUnmock("node:fs");
      vi.doUnmock("piscina");
      vi.resetModules();
    }
  });
});
