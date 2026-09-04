import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { metrics } from "../src/metrics.js";
import {
  BoundedCapture,
  createTelemetryContext,
  createTelemetryFacts,
  createTelemetryPayload,
  IpcTelemetryPublisher,
  TelemetryBatcher,
} from "../src/telemetry.js";

function telemetryFacts(text) {
  const input = new BoundedCapture(1024);
  input.add(Buffer.from(JSON.stringify({ model: "benchmark-model", text })));
  const output = new BoundedCapture(1024);
  output.add(Buffer.from(`data: ${text}\n\n`));
  return createTelemetryFacts({
    context: createTelemetryContext({
      mode: "native",
      model: "benchmark-model",
      startedUnixNano: "1",
      input,
    }),
    statusCode: 200,
    output,
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function withDeadline(promise) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("test timed out")), 2_000);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function resetTelemetryMetrics() {
  Object.assign(metrics.telemetry, {
    mode: "inline",
    pending: 0,
    pendingBytes: 0,
    peakPendingBytes: 0,
    dropped: 0,
    published: 0,
    failed: 0,
    batchesPublished: 0,
    batchesFailed: 0,
  });
}

test("serializes multiple spans into one OTLP envelope", () => {
  const payload = createTelemetryPayload([
    telemetryFacts("first"),
    telemetryFacts("second"),
  ]);

  assert.equal(Buffer.isBuffer(payload), true);
  const envelope = JSON.parse(payload.toString("utf8"));
  assert.equal(envelope.resourceSpans[0].scopeSpans[0].spans.length, 2);
});

test("transfers captured buffers into a telemetry snapshot", () => {
  const capture = new BoundedCapture(4);
  capture.add(Buffer.from("abcdef"));

  const snapshot = capture.takeSnapshot();

  assert.deepEqual(snapshot, {
    bytes: 6,
    capturedBytes: 4,
    truncated: true,
    text: "abcd",
  });
  assert.throws(() => capture.takeSnapshot(), /already taken/);
});

test("flushes telemetry at batch size and timeout", async () => {
  const firstFlush = deferred();
  const secondFlush = deferred();
  const batches = [];
  const batcher = new TelemetryBatcher({
    maxSpans: 2,
    maxWaitMs: 10,
    async publishBatch(batch) {
      batches.push(batch);
      (batches.length === 1 ? firstFlush : secondFlush).resolve();
      return true;
    },
    onBatchSettled() {},
  });

  batcher.enqueue("one");
  batcher.enqueue("two");
  await withDeadline(firstFlush.promise);
  assert.deepEqual(batches[0], ["one", "two"]);

  batcher.enqueue("three");
  await withDeadline(secondFlush.promise);
  assert.deepEqual(batches[1], ["three"]);
  await batcher.close();
});

test("IPC mode bounds unacknowledged facts and releases them on ack", async () => {
  resetTelemetryMetrics();
  const child = new FakeTelemetryChild();
  const publisher = new IpcTelemetryPublisher(
    new URL("http://mock-otel:4318/v1/traces"),
    2,
    { maxSpans: 2, maxWaitMs: 50, child },
  );

  assert.equal(publisher.enqueue(telemetryFacts("first")), true);
  assert.equal(publisher.enqueue(telemetryFacts("second")), true);
  assert.equal(publisher.enqueue(telemetryFacts("dropped")), false);
  assert.equal(metrics.telemetry.pending, 2);

  await withDeadline(publisher.close());

  assert.equal(child.telemetryMessages.length, 2);
  assert.equal(child.telemetryMessages[0].facts.output.text, "data: first\n\n");
  assert.equal("resourceSpans" in child.telemetryMessages[0].facts, false);
  assert.equal(metrics.telemetry.pending, 0);
  assert.equal(metrics.telemetry.pendingBytes, 0);
  assert.equal(metrics.telemetry.published, 2);
  assert.equal(metrics.telemetry.dropped, 1);
  assert.equal(metrics.telemetry.failed, 0);
  assert.equal(metrics.telemetry.batchesPublished, 1);
});

class FakeTelemetryChild extends EventEmitter {
  connected = true;
  exitCode = null;
  killed = false;
  telemetryMessages = [];

  send(message, callback) {
    if (message.type === "telemetry") {
      this.telemetryMessages.push(message);
      if (this.telemetryMessages.length === 2) {
        queueMicrotask(() => {
          this.emit("message", {
            type: "settled",
            ids: this.telemetryMessages.map(({ id }) => id),
            published: true,
          });
        });
      }
    } else if (message.type === "close") {
      queueMicrotask(() => {
        this.emit("message", { type: "closed" });
        this.connected = false;
        this.exitCode = 0;
        this.emit("exit", 0);
      });
    }
    callback?.();
    return true;
  }

  kill() {
    this.killed = true;
  }
}
