import { Readable } from "node:stream";
import { parse } from "csv-parse/sync";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { streamTransformations } from "@langfuse/shared/src/server";

describe("transformStreamToCsv", () => {
  it("round-trips timestamp and cost cells without literal JSON quotes", async () => {
    const name = 'A, "quoted"\nrow';
    const timestamp = new Date("2026-11-03T12:00:00Z");
    const cost = new Decimal("0.0123");
    const stream = Readable.from([
      {
        name,
        timestamp,
        cost,
        metadata: { timestamp, cost },
        count: 3,
        enabled: false,
        missing: null,
      },
    ]).pipe(streamTransformations.CSV());
    let csv = "";

    for await (const chunk of stream) {
      csv += chunk.toString();
    }

    expect(parse(csv, { columns: true })).toEqual([
      {
        name,
        timestamp: "2026-11-03T12:00:00.000Z",
        cost: "0.0123",
        metadata: '{"timestamp":"2026-11-03T12:00:00.000Z","cost":"0.0123"}',
        count: "3",
        enabled: "false",
        missing: "",
      },
    ]);
  });
});
