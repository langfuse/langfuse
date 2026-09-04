import { BatchingHttpPublisher } from "./telemetry.js";

const publisher = new BatchingHttpPublisher({
  url: new URL(process.env.OTEL_URL),
  maxSpans: Number(process.env.TELEMETRY_BATCH_MAX_SPANS),
  maxWaitMs: Number(process.env.TELEMETRY_BATCH_MAX_WAIT_MS),
  onBatchSettled(batch, published) {
    if (!process.connected) return;
    process.send({
      type: "settled",
      ids: batch.map((entry) => entry.id),
      published,
    });
  },
});

let closing = false;

process.on("message", (message) => {
  if (message?.type === "telemetry" && !closing) {
    const accepted = publisher.enqueue({
      id: message.id,
      facts: message.facts,
    });
    if (!accepted && process.connected) {
      process.send({
        type: "settled",
        ids: [message.id],
        published: false,
      });
    }
  } else if (message?.type === "close") {
    void close();
  }
});

process.on("disconnect", () => void close());

async function close() {
  if (closing) return;
  closing = true;
  await publisher.close();
  if (process.connected) {
    process.send({ type: "closed" }, () => process.disconnect());
  }
}
