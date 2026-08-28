import express from "express";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { performance } from "node:perf_hooks";
import { Pool } from "undici";

import { config } from "./config.js";
import { finishRequest, metrics, metricsSnapshot } from "./metrics.js";
import {
  BoundedCapture,
  createTelemetryContext,
  createTelemetryFacts,
  createTelemetryPublisher,
} from "./telemetry.js";
import {
  anthropicResponseToOpenAi,
  createAnthropicSseTransform,
  openAiToAnthropic,
  TranslationError,
} from "./translate.js";

const app = express();
const upstreamPool = new Pool(config.upstreamUrl.origin, {
  pipelining: 1,
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 60_000,
});
const telemetry = createTelemetryPublisher(config);

app.disable("x-powered-by");

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    runtime: "node",
    versions: { node: process.versions.node, v8: process.versions.v8 },
  });
});

app.get("/metrics", (_request, response) => {
  response.json(metricsSnapshot());
});

app.post(
  "/v1/chat/completions",
  express.raw({ type: () => true, limit: config.bodyLimitBytes }),
  async (request, response) => {
    const startedAt = performance.now();
    const startedUnixNano = String(BigInt(Date.now()) * 1_000_000n);
    const input = new BoundedCapture(config.captureLimitBytes);
    const output = new BoundedCapture(config.captureLimitBytes);
    const abort = new AbortController();
    let statusCode = 500;
    let failed = true;
    let errorMessage;
    let model = "unknown";
    let telemetryContext;
    let telemetryFinalized = false;

    const modeHeader = request.get("x-benchmark-mode") || "native";
    const mode = modeHeader === "translate" ? "translate" : "native";
    const rawTelemetrySnapshots = config.telemetryMode === "ipc";

    metrics.requests.total += 1;
    metrics.requests.active += 1;
    metrics.requests[mode] += 1;
    input.add(request.body);
    metrics.requests.requestBytes += request.body.length;

    const cancelUpstream = () => abort.abort();
    request.once("aborted", cancelUpstream);
    response.once("close", () => {
      if (!response.writableEnded) cancelUpstream();
    });

    const finalizeTelemetry = () => {
      if (telemetryFinalized) return;
      telemetryFinalized = true;
      try {
        telemetryContext ??= createTelemetryContext({
          mode,
          model,
          startedUnixNano,
          input,
          rawSnapshots: rawTelemetrySnapshots,
        });
        telemetry.enqueue(
          createTelemetryFacts({
            context: telemetryContext,
            statusCode,
            output,
            error: errorMessage,
            rawSnapshots: rawTelemetrySnapshots,
          }),
        );
      } catch {
        metrics.telemetry.failed += 1;
      }
    };

    try {
      if (modeHeader !== "native" && modeHeader !== "translate") {
        statusCode = 400;
        response.status(statusCode).json({
          error: "x-benchmark-mode must be native or translate",
        });
        output.add(JSON.stringify({ error: "invalid benchmark mode" }));
        return;
      }

      let parsed;
      if (mode === "translate") {
        try {
          parsed = JSON.parse(request.body.toString("utf8"));
          model = parsed.model || model;
        } catch {
          throw new TranslationError("request body must be valid JSON");
        }
      } else {
        try {
          model = JSON.parse(request.body.toString("utf8")).model || model;
        } catch {
          // Native mode deliberately forwards malformed JSON unchanged.
        }
      }

      let upstreamBody =
        mode === "native"
          ? request.body
          : Buffer.from(JSON.stringify(openAiToAnthropic(parsed)));
      const translateStream = mode === "translate" && parsed.stream === true;
      // Match Rust's request translator, which drops its parsed JSON tree once
      // the serialized upstream body has been produced. Keeping this object
      // across the upstream await retains the full base64 image per request.
      parsed = undefined;
      const path =
        mode === "native"
          ? "/openai/v1/chat/completions"
          : "/anthropic/v1/messages";
      telemetryContext = createTelemetryContext({
        mode,
        model,
        startedUnixNano,
        input,
        rawSnapshots: rawTelemetrySnapshots,
      });

      const upstreamHeaders = {
        "content-type": "application/json",
        accept: request.get("accept") || "*/*",
        "content-length": String(upstreamBody.length),
      };
      for (const name of [
        "x-benchmark-chunks",
        "x-benchmark-chunk-delay-ms",
        "x-benchmark-chunk-bytes",
        "x-benchmark-stream-profile",
      ]) {
        const value = request.get(name);
        if (value !== undefined) upstreamHeaders[name] = value;
      }

      const upstream = await upstreamPool.request({
        method: "POST",
        path,
        headers: upstreamHeaders,
        body: upstreamBody,
        signal: abort.signal,
        bodyTimeout: 0,
        maxRedirections: 0,
      });

      // The mock upstream consumes the full request before returning headers.
      // Release large input/translation buffers before the long response stream.
      request.body = undefined;
      upstreamBody = undefined;

      statusCode = upstream.statusCode;
      response.status(statusCode);
      copyResponseHeaders(upstream.headers, response);

      if (mode === "translate" && statusCode < 400) {
        if (translateStream) {
          response.setHeader(
            "content-type",
            "text/event-stream; charset=utf-8",
          );
          const observer = captureTransform(output, finalizeTelemetry);
          await pipeline(
            upstream.body,
            createAnthropicSseTransform(model),
            observer,
            response,
          );
        } else {
          const anthropicBody = await upstream.body.json();
          const translated = anthropicResponseToOpenAi(anthropicBody);
          output.add(Buffer.from(JSON.stringify(translated)));
          finalizeTelemetry();
          response.json(translated);
        }
      } else {
        await pipeline(
          upstream.body,
          captureTransform(output, finalizeTelemetry),
          response,
        );
      }

      failed = statusCode >= 500;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      if (error instanceof TranslationError && !response.headersSent) {
        statusCode = 400;
        const body = Buffer.from(JSON.stringify({ error: error.message }));
        output.add(body);
        response.status(statusCode).type("json").send(body);
      } else if (!response.headersSent && !response.destroyed) {
        statusCode = abort.signal.aborted ? 499 : 502;
        const body = Buffer.from(
          JSON.stringify({
            error: abort.signal.aborted ? "request aborted" : errorMessage,
          }),
        );
        output.add(body);
        response.status(statusCode).type("json").send(body);
      } else if (!response.destroyed) {
        response.destroy(error instanceof Error ? error : undefined);
      }
    } finally {
      request.off("aborted", cancelUpstream);
      const durationMs = performance.now() - startedAt;
      failed = failed || Boolean(errorMessage) || statusCode >= 500;
      finishRequest({ durationMs, failed, responseBytes: output.totalBytes });
      finalizeTelemetry();
    }
  },
);

app.use((error, _request, response, _next) => {
  if (error?.type === "entity.too.large") {
    response.status(413).json({ error: "request body too large" });
    return;
  }
  response.status(400).json({ error: error?.message || "invalid request" });
});

function captureTransform(capture, onFlush) {
  return new Transform({
    transform(chunk, _encoding, callback) {
      capture.add(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      onFlush?.();
      callback();
    },
  });
}

function copyResponseHeaders(headers, response) {
  for (const name of ["content-type", "cache-control", "x-request-id"]) {
    const value = headers[name];
    if (value !== undefined) response.setHeader(name, value);
  }
}

const server = app.listen(config.port, "0.0.0.0", () => {
  process.stdout.write(`node gateway listening on ${config.port}\n`);
});
server.on("connection", (socket) => socket.setNoDelay(true));

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await Promise.allSettled([upstreamPool.close(), telemetry.close()]);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
