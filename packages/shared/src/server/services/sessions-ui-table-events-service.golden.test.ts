import { beforeEach, describe, expect, it, vi } from "vitest";

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

// Enter through the server barrel: importing the service directly hits the
// db -> server-barrel -> events import cycle before events.ts initializes.
import { getSessionTracesFromEvents } from "../index";

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

describeWithClickhouse("golden: sessions simple aggregates family", () => {
  beforeEach(() => {
    resetCaptures();
  });

  it("getSessionTracesFromEvents", async () => {
    await getSessionTracesFromEvents({
      projectId: "golden-project",
      sessionId: "golden-session",
    });
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});
