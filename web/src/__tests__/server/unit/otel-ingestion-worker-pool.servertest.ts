import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";
import type { NextApiResponse } from "next";

import {
  createOtelIngestionWorkerContext,
  getTransferableOtelBody,
  type OtelIngestionWorkerContext,
  type OtelIngestionWorkerContextResult,
} from "@/src/server/otel/otelIngestionWorkerPool";

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

describe("OTel ingestion worker pool", () => {
  it("returns a cloneable JSON representation of a BullMQ job", async () => {
    const toKey = (() => "job-key").bind({});
    const originalJob = { id: "job-id", data: { type: "otel" }, toKey };
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
      if (result.kind !== "ok") {
        throw new Error(`Unexpected worker result: ${result.kind}`);
      }
      expect(JSON.stringify(result.body)).toBe(JSON.stringify(originalJob));
    } finally {
      vi.doUnmock("@/src/server/otel/processOtelIngestion");
      vi.resetModules();
    }
  });

  it("admits one active and one queued unread request, rejecting a third as busy", async () => {
    const first = createContext();
    expect(first.req.isPaused()).toBe(false);

    const queued = createContext();
    expect(queued.req.isPaused()).toBe(true);
    queued.req.write("queued body");
    expect(queued.req.readableLength).toBeGreaterThan(0);

    const third = createContext();
    try {
      await expect(third.result).resolves.toEqual({
        response: { error: "OTel ingestion worker is busy" },
      });
      expect(third.res.status).toHaveBeenCalledWith(503);
      expect(third.res.setHeader).toHaveBeenCalledWith("Retry-After", 1);
      expect(third.res.setHeader).toHaveBeenCalledWith("Connection", "close");
      third.req.write("third body");
      expect(third.req.readableLength).toBeGreaterThan(0);

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

  it.each(["aborted", "response-close"] as const)(
    "removes a queued request after %s so capacity can be reused",
    async (abortEvent) => {
      const first = createContext({}, 4);
      const queued = createContext({}, 4);
      queued.req.write("queued body");
      expect(queued.req.isPaused()).toBe(true);
      if (abortEvent === "aborted") {
        queued.req.emit("aborted");
      } else {
        expect(queued.req.complete).toBe(true);
        queued.res.emit("close");
      }
      await expect(queued.result).resolves.toEqual({ response: {} });
      expect(queued.req.readableLength).toBeGreaterThan(0);

      const next = createContext({}, 4);
      expect(next.req.isPaused()).toBe(true);
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
    },
  );

  it.each(["finish", "close"] as const)(
    "keeps the worker queued after a body read error until response %s",
    async (releaseEvent) => {
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

        first.res.emit(releaseEvent);
        next.req.end("next");
        expect(expectContext(await next.result).body).toEqual(
          Buffer.from("next"),
        );
        await nextObservation;
      } finally {
        finish(first);
        if (next) finish(next);
      }
    },
  );

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
