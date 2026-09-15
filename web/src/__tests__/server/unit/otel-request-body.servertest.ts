import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn() },
  markProjectAsOtelUser: vi.fn(),
}));
const routeEnv = vi.hoisted(() => ({
  LANGFUSE_OTEL_INGESTION_MAX_BODY_BYTES: 4,
}));

vi.mock("@/src/env.mjs", () => ({
  env: routeEnv,
}));
vi.mock("@/src/features/public-api/server/withMiddlewares", () => ({
  withMiddlewares: (handlers: unknown) => handlers,
}));
vi.mock("@/src/features/public-api/server/createAuthedProjectAPIRoute", () => ({
  createAuthedProjectAPIRoute: ({ fn }: { fn: unknown }) => fn,
}));
vi.mock("@langfuse/shared", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("@langfuse/shared/src/server", () => ({
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn() }),
  },
  createIngestionAttribution: vi.fn(),
  getCurrentSpan: vi.fn(),
  getLangfuseHeaderValue: vi.fn(),
  logger: { ...routeMocks.logger, debug: vi.fn() },
  markProjectAsOtelUser: routeMocks.markProjectAsOtelUser,
  markProjectIngestFailure: vi.fn(),
  OtelIngestionProcessor: class OtelIngestionProcessor {},
  recordIncrement: vi.fn(),
  redis: { disconnect: vi.fn(), status: "end" },
  validateOtelSpanIds: vi.fn(),
}));

import {
  gunzipOtelRequestBody,
  OtelRequestBodyTooLargeError,
  readOtelRequestBody,
} from "@/src/server/otel/otelRequestBody";
import otelRoute from "@/src/pages/api/public/otel/v1/traces";

function request(headers: Record<string, string> = {}) {
  const stream = new PassThrough() as PassThrough &
    IncomingMessage & {
      headers: Record<string, string>;
    };
  stream.headers = headers;
  return stream;
}

function response() {
  return {
    status: vi.fn(),
    setHeader: vi.fn(),
  };
}

describe("OTel request body limits", () => {
  it("reads a body within the configured limit", async () => {
    const req = request({ "content-length": "5" });
    const bodyPromise = readOtelRequestBody(req, 5);
    req.end("hello");

    await expect(bodyPromise).resolves.toEqual(Buffer.from("hello"));
  });

  it("aborts an in-flight read when its deadline signal aborts", async () => {
    const req = request({ "content-length": "5" });
    const controller = new AbortController();
    const bodyPromise = readOtelRequestBody(req, 5, controller.signal);

    controller.abort();
    await expect(bodyPromise).rejects.toMatchObject({ code: "ABORT_ERR" });
  });

  it("rejects a declared body above the limit before reading", async () => {
    const req = request({ "content-length": "5" });

    await expect(readOtelRequestBody(req, 4)).rejects.toMatchObject({
      name: "OtelRequestBodyTooLargeError",
      maxBytes: 4,
      afterDecompression: false,
    });
    expect(req.listenerCount("data")).toBe(0);
    req.destroy();
  });

  it("rejects a chunked body when it crosses the limit", async () => {
    const req = request();
    const bodyPromise = readOtelRequestBody(req, 4);
    req.end("12345");

    await expect(bodyPromise).rejects.toBeInstanceOf(
      OtelRequestBodyTooLargeError,
    );
    req.resume();
  });

  it("decompresses a gzip body within the configured limit", async () => {
    const body = Buffer.from('{"resourceSpans":[]}');

    await expect(
      gunzipOtelRequestBody(gzipSync(body), body.byteLength),
    ).resolves.toEqual(body);
  });

  it("stops decompressing a gzip body when it crosses the limit", async () => {
    const compressedBody = gzipSync(Buffer.alloc(8 * 1024, "x"));

    await expect(
      gunzipOtelRequestBody(compressedBody, 1024),
    ).rejects.toMatchObject({
      name: "OtelRequestBodyTooLargeError",
      message:
        "OTel request body exceeds the 1024 bytes limit after decompression",
      maxBytes: 1024,
      afterDecompression: true,
    });
  });

  it("maps an encoded overflow to the route's 413 response", async () => {
    routeEnv.LANGFUSE_OTEL_INGESTION_MAX_BODY_BYTES = 4;
    const req = request({
      "content-length": "5",
      "content-type": "application/json",
    });
    const res = response();
    const post = (
      otelRoute as unknown as {
        POST: (params: unknown) => Promise<unknown>;
      }
    ).POST;

    await expect(
      post({
        req,
        res,
        auth: { scope: { isIngestionSuspended: false, projectId: "project" } },
      }),
    ).resolves.toEqual({
      error: "OTel request body exceeds the 4 bytes limit",
    });
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "close");
    req.destroy();
  });

  it("maps a decompressed overflow to the route's 413 response", async () => {
    routeEnv.LANGFUSE_OTEL_INGESTION_MAX_BODY_BYTES = 64;
    const body = gzipSync(Buffer.alloc(8 * 1024, "x"));
    const req = request({
      "content-length": String(body.byteLength),
      "content-encoding": "gzip",
      "content-type": "application/json",
    });
    const res = response();
    const post = (
      otelRoute as unknown as {
        POST: (params: unknown) => Promise<unknown>;
      }
    ).POST;
    const resultPromise = post({
      req,
      res,
      auth: { scope: { isIngestionSuspended: false, projectId: "project" } },
    });
    req.end(body);

    await expect(resultPromise).resolves.toEqual({
      error: "OTel request body exceeds the 64 bytes limit after decompression",
    });
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.setHeader).not.toHaveBeenCalled();
    req.destroy();
  });
});
