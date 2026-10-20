import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../db";
import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "../repositories/goldenHarness";

vi.mock("../repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../repositories/clickhouse")>();
  const { buildClickhouseMock } =
    await import("../repositories/goldenHarness.js");
  return buildClickhouseMock(actual);
});

// Load the server barrel first: importing the module alone hits the
// db -> server-barrel -> events import cycle before events.ts initializes.
import "../index";
import { selectTopicTraceRows } from "./trace-selection";

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

describeWithClickhouse("golden: topics trace selection", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it.each(["ids", "backfill", "preview"] as const)(
    "selectTopicTraceRows mode=%s",
    async (mode) => {
      await selectTopicTraceRows(
        {
          projectId: "golden-project",
          filter: [],
          limit: 100,
          sampling: "latest",
          from: new Date("2026-01-01T00:00:00.000Z"),
          to: new Date("2026-01-02T00:00:00.000Z"),
          seed: "golden-seed",
        },
        prisma,
        mode,
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    },
  );
});
