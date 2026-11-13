import { describe, expect, it } from "vitest";

import { prisma } from "../../db";
import {
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
} from "../repositories/goldenHarness";
import { topicMatchingTraceIdsQuery } from "./trace-selection";

const FIXED_PROJECT_ID = "golden-project";
const FIXED_FROM = new Date("2026-01-01T00:00:00.000Z");
const FIXED_TO = new Date("2026-01-02T00:00:00.000Z");

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[golden-harness] `clickhouse format` unavailable — skipping golden SQL tests. Install clickhouse-local to run them.",
  );
}

describeWithClickhouse("golden: topics trace selection", () => {
  // `traceName` is applied outside the shared events row selection, with its
  // own column mapping; the other leaf and the window go through it. `prisma`
  // is never queried: no comment filter is set.
  it("topicMatchingTraceIdsQuery filter=traceName+native", async () => {
    const built = await topicMatchingTraceIdsQuery(
      {
        projectId: FIXED_PROJECT_ID,
        from: FIXED_FROM,
        to: FIXED_TO,
        filter: [
          {
            column: "traceName",
            type: "string",
            operator: "=",
            value: "golden-name",
          },
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION"],
          },
        ],
      },
      prisma,
    );
    if (!built) throw new Error("expected a query: no comment filter is set");
    expect(
      normalizeCapturedQueries([
        {
          fn: "topicMatchingTraceIdsQuery",
          query: built.query,
          params: built.params,
        },
      ]),
    ).toMatchSnapshot();
  });
});
