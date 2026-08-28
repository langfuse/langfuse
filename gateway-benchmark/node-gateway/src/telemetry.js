import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Pool } from "undici";

import { metrics } from "./metrics.js";

const IPC_WORKER_PATH = fileURLToPath(
  new URL("./telemetry-worker.js", import.meta.url),
);

export class BoundedCapture {
  #chunks = [];
  #capturedBytes = 0;
  #taken = false;

  constructor(limitBytes) {
    this.limitBytes = limitBytes;
    this.totalBytes = 0;
  }

  add(value) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    this.totalBytes += buffer.length;
    const remaining = this.limitBytes - this.#capturedBytes;
    if (remaining <= 0) return;
    // Copy the bounded preview so it does not retain a multi-megabyte request
    // buffer for the lifetime of a long-running stream.
    const slice = Buffer.from(buffer.subarray(0, remaining));
    this.#chunks.push(slice);
    this.#capturedBytes += slice.length;
  }

  takeSnapshot({ raw = false } = {}) {
    if (this.#taken) throw new Error("capture snapshot already taken");
    this.#taken = true;
    const chunks = this.#chunks;
    // A request preview is immutable once telemetry starts. Hand ownership to
    // the snapshot so the request-local capture no longer retains a duplicate
    // reference for the lifetime of a long response stream.
    this.#chunks = [];
    const snapshot = {
      bytes: this.totalBytes,
      capturedBytes: this.#capturedBytes,
      truncated: this.totalBytes > this.#capturedBytes,
    };
    if (raw) {
      // The IPC worker performs concatenation and UTF-8 decoding. The parent
      // still pays Node IPC serialization/copying, which is part of the setup
      // being measured.
      return { ...snapshot, chunks };
    }
    return {
      ...snapshot,
      text: Buffer.concat(chunks).toString("utf8"),
    };
  }
}

function attribute(key, value) {
  if (typeof value === "boolean") {
    return { key, value: { boolValue: value } };
  }
  if (typeof value === "number") {
    return { key, value: { intValue: String(Math.trunc(value)) } };
  }
  return { key, value: { stringValue: String(value) } };
}

function nowUnixNano() {
  return String(BigInt(Date.now()) * 1_000_000n);
}

export function createTelemetryContext({
  mode,
  model,
  startedUnixNano,
  input,
  rawSnapshots = false,
}) {
  return {
    mode,
    model,
    startedUnixNano,
    input: input.takeSnapshot({ raw: rawSnapshots }),
    traceId: randomBytes(16).toString("base64"),
    spanId: randomBytes(8).toString("base64"),
  };
}

export function createTelemetryFacts({
  context,
  statusCode,
  output,
  error,
  rawSnapshots = false,
}) {
  return {
    ...context,
    endTimeUnixNano: nowUnixNano(),
    statusCode,
    output: output.takeSnapshot({ raw: rawSnapshots }),
    error,
  };
}

function spanFromFacts(facts) {
  const inputText = snapshotText(facts.input);
  const outputText = snapshotText(facts.output);
  return {
    traceId: facts.traceId,
    spanId: facts.spanId,
    name: "POST /v1/chat/completions",
    kind: 2,
    startTimeUnixNano: facts.startedUnixNano,
    endTimeUnixNano: facts.endTimeUnixNano,
    attributes: [
      attribute("benchmark.runtime", "node"),
      attribute("benchmark.mode", facts.mode),
      attribute("gen_ai.request.model", facts.model || "unknown"),
      attribute("http.response.status_code", facts.statusCode),
      attribute("benchmark.input.bytes", facts.input.bytes),
      attribute("benchmark.output.bytes", facts.output.bytes),
      attribute("benchmark.input.truncated", facts.input.truncated),
      attribute("benchmark.output.truncated", facts.output.truncated),
      attribute("gen_ai.input.messages", inputText),
      attribute("gen_ai.output.messages", outputText),
      ...(facts.error ? [attribute("error.message", facts.error)] : []),
    ],
    status: {
      code: facts.error || facts.statusCode >= 500 ? 2 : 1,
    },
  };
}

function snapshotText(snapshot) {
  if (typeof snapshot.text === "string") return snapshot.text;
  if (!Array.isArray(snapshot.chunks)) return "";
  return Buffer.concat(
    snapshot.chunks.map((chunk) =>
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
    ),
  ).toString("utf8");
}

export function createTelemetryPayload(facts) {
  const batch = Array.isArray(facts) ? facts : [facts];
  return Buffer.from(
    JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [attribute("service.name", "gateway-benchmark-node")],
          },
          scopeSpans: [
            {
              scope: { name: "gateway-benchmark", version: "0.0.0" },
              spans: batch.map(spanFromFacts),
            },
          ],
        },
      ],
    }),
  );
}

function pendingFactBytes(facts) {
  // The large fields already carry their captured byte lengths. Avoid another
  // scan or serialization on the request path merely for accounting.
  return facts.input.capturedBytes + facts.output.capturedBytes;
}

export class TelemetryBatcher {
  #closed = false;
  #draining = null;
  #flushPartial = false;
  #flushAll = false;
  #queue = [];
  #timer = null;

  constructor({ maxSpans, maxWaitMs, publishBatch, onBatchSettled }) {
    this.maxSpans = maxSpans;
    this.maxWaitMs = maxWaitMs;
    this.publishBatch = publishBatch;
    this.onBatchSettled = onBatchSettled;
  }

  enqueue(entry) {
    if (this.#closed) return false;
    this.#queue.push(entry);
    if (this.#queue.length >= this.maxSpans) {
      this.#clearTimer();
      void this.#startDrain();
    } else {
      this.#scheduleTimer();
    }
    return true;
  }

  #scheduleTimer() {
    if (this.#timer || this.#closed) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#flushPartial = true;
      void this.#startDrain();
    }, this.maxWaitMs);
    this.#timer.unref?.();
  }

  #clearTimer() {
    if (!this.#timer) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #startDrain() {
    if (this.#draining) return this.#draining;
    this.#draining = this.#drain().finally(() => {
      this.#draining = null;
      if (
        this.#queue.length >= this.maxSpans ||
        this.#flushPartial ||
        this.#flushAll
      ) {
        void this.#startDrain();
      } else if (this.#queue.length > 0) {
        this.#scheduleTimer();
      }
    });
    return this.#draining;
  }

  async #drain() {
    while (this.#queue.length > 0) {
      if (
        !this.#flushAll &&
        !this.#flushPartial &&
        this.#queue.length < this.maxSpans
      ) {
        return;
      }
      this.#flushPartial = false;
      this.#clearTimer();
      const batch = this.#queue.splice(0, this.maxSpans);
      let published = false;
      try {
        published = (await this.publishBatch(batch)) !== false;
      } catch {
        published = false;
      }
      this.onBatchSettled(batch, published);
    }
    this.#flushAll = false;
  }

  async close() {
    if (this.#closed && this.#queue.length === 0 && !this.#draining) return;
    this.#closed = true;
    this.#flushAll = true;
    this.#clearTimer();
    while (this.#queue.length > 0 || this.#draining) {
      await this.#startDrain();
    }
  }
}

export class BatchingHttpPublisher {
  constructor({ url, maxSpans, maxWaitMs, onBatchSettled }) {
    this.url = url;
    this.pool = new Pool(url.origin, {
      connections: 8,
      pipelining: 1,
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 60_000,
    });
    this.batcher = new TelemetryBatcher({
      maxSpans,
      maxWaitMs,
      publishBatch: (batch) => this.#publish(batch),
      onBatchSettled,
    });
  }

  enqueue(entry) {
    return this.batcher.enqueue(entry);
  }

  async #publish(batch) {
    const payload = createTelemetryPayload(batch.map((entry) => entry.facts));
    const response = await this.pool.request({
      method: "POST",
      path: `${this.url.pathname}${this.url.search}`,
      headers: {
        "content-type": "application/json",
        "content-length": String(payload.length),
      },
      body: payload,
      maxRedirections: 0,
    });
    await response.body.dump();
    return response.statusCode >= 200 && response.statusCode < 300;
  }

  async close() {
    await this.batcher.close();
    await this.pool.close();
  }
}

function reservePending(bytes) {
  metrics.telemetry.pending += 1;
  metrics.telemetry.pendingBytes += bytes;
  metrics.telemetry.peakPendingBytes = Math.max(
    metrics.telemetry.peakPendingBytes,
    metrics.telemetry.pendingBytes,
  );
}

function releasePending(entries) {
  metrics.telemetry.pending -= entries.length;
  for (const entry of entries) {
    metrics.telemetry.pendingBytes -= entry.bytes;
  }
}

function recordBatch(entries, published) {
  releasePending(entries);
  if (published) {
    metrics.telemetry.published += entries.length;
    metrics.telemetry.batchesPublished += 1;
  } else {
    metrics.telemetry.failed += entries.length;
    metrics.telemetry.batchesFailed += 1;
  }
}

export class TelemetryPublisher {
  #closed = false;

  constructor(url, capacity, { maxSpans, maxWaitMs }) {
    this.capacity = capacity;
    this.publisher = new BatchingHttpPublisher({
      url,
      maxSpans,
      maxWaitMs,
      onBatchSettled: recordBatch,
    });
  }

  enqueue(facts) {
    if (this.#closed || metrics.telemetry.pending >= this.capacity) {
      metrics.telemetry.dropped += 1;
      return false;
    }
    const entry = { facts, bytes: pendingFactBytes(facts) };
    reservePending(entry.bytes);
    if (!this.publisher.enqueue(entry)) {
      releasePending([entry]);
      metrics.telemetry.dropped += 1;
      return false;
    }
    return true;
  }

  async close() {
    this.#closed = true;
    await this.publisher.close();
  }
}

export class IpcTelemetryPublisher {
  #closed = false;
  #closedResolve;
  #closedPromise;
  #nextId = 1;
  #pending = new Map();

  constructor(url, capacity, { maxSpans, maxWaitMs, child }) {
    this.capacity = capacity;
    this.#closedPromise = new Promise((resolve) => {
      this.#closedResolve = resolve;
    });
    this.child =
      child ??
      fork(IPC_WORKER_PATH, [], {
        env: {
          ...process.env,
          OTEL_URL: url.href,
          TELEMETRY_BATCH_MAX_SPANS: String(maxSpans),
          TELEMETRY_BATCH_MAX_WAIT_MS: String(maxWaitMs),
        },
        execArgv: [],
        serialization: "advanced",
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
    this.child.on("message", (message) => this.#onMessage(message));
    this.child.on("error", () => this.#failAll());
    this.child.on("exit", () => {
      this.#failAll();
      this.#closedResolve();
    });
  }

  enqueue(facts) {
    if (
      this.#closed ||
      !this.child.connected ||
      this.#pending.size >= this.capacity
    ) {
      metrics.telemetry.dropped += 1;
      return false;
    }

    const id = this.#nextId++;
    const entry = { bytes: pendingFactBytes(facts) };
    this.#pending.set(id, entry);
    reservePending(entry.bytes);
    try {
      this.child.send({ type: "telemetry", id, facts }, (error) => {
        if (error) this.#settle([id], false, false);
      });
    } catch {
      this.#settle([id], false, false);
      return false;
    }
    return true;
  }

  #onMessage(message) {
    if (message?.type === "settled" && Array.isArray(message.ids)) {
      this.#settle(message.ids, message.published, true);
    } else if (message?.type === "closed") {
      this.#closedResolve();
    }
  }

  #settle(ids, published, countBatch) {
    const entries = [];
    for (const id of ids) {
      const entry = this.#pending.get(id);
      if (!entry) continue;
      this.#pending.delete(id);
      entries.push(entry);
    }
    if (entries.length === 0) return;
    releasePending(entries);
    if (published) metrics.telemetry.published += entries.length;
    else metrics.telemetry.failed += entries.length;
    if (countBatch) {
      if (published) metrics.telemetry.batchesPublished += 1;
      else metrics.telemetry.batchesFailed += 1;
    }
  }

  #failAll() {
    this.#settle([...this.#pending.keys()], false, false);
  }

  async close() {
    if (this.#closed) return this.#closedPromise;
    this.#closed = true;
    if (this.child.connected) {
      try {
        this.child.send({ type: "close" });
      } catch {
        this.#failAll();
      }
    } else {
      this.#failAll();
      this.#closedResolve();
    }

    let timeoutId;
    const timeout = new Promise((resolve) => {
      timeoutId = setTimeout(resolve, 5_000);
    });
    await Promise.race([this.#closedPromise, timeout]);
    clearTimeout(timeoutId);
    if (this.child.exitCode === null && !this.child.killed) {
      this.child.kill();
    }
    this.#failAll();
  }
}

export function createTelemetryPublisher(config) {
  const options = {
    maxSpans: config.telemetryBatchMaxSpans,
    maxWaitMs: config.telemetryBatchMaxWaitMs,
  };
  metrics.telemetry.mode = config.telemetryMode;
  if (config.telemetryMode === "ipc") {
    return new IpcTelemetryPublisher(
      config.otelUrl,
      config.telemetryQueueCapacity,
      options,
    );
  }
  return new TelemetryPublisher(
    config.otelUrl,
    config.telemetryQueueCapacity,
    options,
  );
}
