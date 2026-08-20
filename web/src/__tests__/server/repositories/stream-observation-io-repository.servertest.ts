import { randomUUID } from "crypto";
import { describe, expect } from "vitest";
import {
  createEvent,
  createEventsCh,
  getObservationIOFieldByteLengthFromEventsTable,
  streamObservationIOFieldFromEventsTable,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

// Reads the v4 events table (events_full), so gate on the same preview opt-in as
// the rest of the events-repository suite.
const maybe =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

async function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

maybe("streamObservationIOFieldFromEventsTable", () => {
  it("streams each raw IO field for the scoped observation", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    const observationId = randomUUID();
    const startMs = Date.now();

    const input = JSON.stringify({ prompt: "hello 🌍", n: 42 });
    const output = JSON.stringify([{ role: "assistant", content: "hi" }]);

    await createEventsCh([
      createEvent({
        id: observationId,
        span_id: observationId,
        project_id: projectId,
        trace_id: traceId,
        input,
        output,
        metadata_names: ["k1", "k2"],
        metadata_values: ["v1", "v2"],
        start_time: startMs * 1000, // micros
      }),
    ]);

    const startTime = new Date(startMs);

    const inputText = await streamObservationIOFieldFromEventsTable({
      projectId,
      traceId,
      observationId,
      field: "input",
      startTime,
    }).then((r) => collectStream(r.stream));
    expect(inputText).toBe(input);

    const outputText = await streamObservationIOFieldFromEventsTable({
      projectId,
      traceId,
      observationId,
      field: "output",
      startTime,
    }).then((r) => collectStream(r.stream));
    expect(outputText).toBe(output);

    const metadataText = await streamObservationIOFieldFromEventsTable({
      projectId,
      traceId,
      observationId,
      field: "metadata",
      startTime,
    }).then((r) => collectStream(r.stream));
    expect(JSON.parse(metadataText)).toMatchObject({ k1: "v1", k2: "v2" });
  });

  it("returns zero bytes for a different project (tenant isolation)", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    const observationId = randomUUID();
    const startMs = Date.now();

    await createEventsCh([
      createEvent({
        id: observationId,
        span_id: observationId,
        project_id: projectId,
        trace_id: traceId,
        input: "secret tenant data",
        start_time: startMs * 1000,
      }),
    ]);

    // Same trace/observation ids, but a foreign projectId must never match.
    const crossProject = await streamObservationIOFieldFromEventsTable({
      projectId: randomUUID(),
      traceId,
      observationId,
      field: "input",
      startTime: new Date(startMs),
    }).then((r) => collectStream(r.stream));

    expect(crossProject).toBe("");
  });

  it("byte length is the field's UTF-8 byte count, and null for a foreign project", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    const observationId = randomUUID();
    const startMs = Date.now();
    // Contains a 4-byte emoji, so byte length > character length: verifies
    // ClickHouse `length()` counts bytes (what Content-Length needs).
    const input = JSON.stringify({ prompt: "hello 🌍", n: 42 });

    await createEventsCh([
      createEvent({
        id: observationId,
        span_id: observationId,
        project_id: projectId,
        trace_id: traceId,
        input,
        start_time: startMs * 1000,
      }),
    ]);
    const startTime = new Date(startMs);

    const len = await getObservationIOFieldByteLengthFromEventsTable({
      projectId,
      traceId,
      observationId,
      field: "input",
      startTime,
    });
    expect(len).toBe(Buffer.byteLength(input, "utf8"));

    // No matching row → null (the route turns this into a 404, not empty 200).
    const missing = await getObservationIOFieldByteLengthFromEventsTable({
      projectId: randomUUID(),
      traceId,
      observationId,
      field: "input",
      startTime,
    });
    expect(missing).toBeNull();
  });
});
