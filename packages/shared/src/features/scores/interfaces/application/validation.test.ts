import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type ScoreDomain } from "../../../../domain/scores";
import { filterAndValidateLegacyV1GetScoreList } from "../api/v1/validation";
import { filterAndValidateV2GetScoreList } from "../api/v2/validation";
import { filterAndValidateV3GetScoreList } from "../api/v3/validation";
import {
  filterAndValidateDbLegacyTraceScoreList,
  filterAndValidateDbScoreList,
} from "./validation";

const score: ScoreDomain = {
  id: "valid-score",
  projectId: "project",
  name: "quality",
  dataType: "NUMERIC",
  value: 1,
  stringValue: null,
  longStringValue: "",
  source: "API",
  environment: "default",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  timestamp: new Date("2026-01-01"),
  traceId: "trace",
  observationId: null,
  sessionId: null,
  datasetRunId: null,
  authorUserId: null,
  comment: null,
  metadata: {},
  configId: null,
  queueId: null,
  executionTraceId: null,
};

const filters: {
  name: string;
  run: (
    scores: ScoreDomain[],
    reporter: (error: z.ZodError) => void,
  ) => unknown[];
}[] = [
  {
    name: "application scores",
    run: (scores, onParseError) =>
      filterAndValidateDbScoreList({
        scores,
        dataTypes: ["NUMERIC"],
        onParseError,
      }),
  },
  {
    name: "legacy trace scores",
    run: (scores, onParseError) =>
      filterAndValidateDbLegacyTraceScoreList({ scores, onParseError }),
  },
  {
    name: "API v1 scores",
    run: (scores, onParseError) =>
      filterAndValidateLegacyV1GetScoreList(
        scores.map((row) => ({ ...row, trace: {} })),
        onParseError,
      ),
  },
  { name: "API v2 scores", run: filterAndValidateV2GetScoreList },
  { name: "API v3 scores", run: filterAndValidateV3GetScoreList },
];

afterEach(() => vi.restoreAllMocks());

describe("filtered score validation reporting", () => {
  it.each(filters)(
    "$name reports rejected rows only through the supplied callback",
    ({ run }) => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const reportWarning = vi.fn();

      const result = run(
        [score, { ...score, id: "invalid-score", value: NaN }],
        reportWarning,
      );

      expect(result).toEqual([expect.objectContaining({ id: "valid-score" })]);
      expect(reportWarning).toHaveBeenCalledExactlyOnceWith(
        expect.any(z.ZodError),
      );
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it("preserves client console error reporting without duplicate captures", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    filterAndValidateDbScoreList({
      scores: [{ ...score, value: NaN }],
      dataTypes: ["NUMERIC"],
      onParseError: (error) => console.error(error),
    });

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      expect.any(z.ZodError),
    );
  });

  it("defaults to console.error when no reporter is supplied", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    filterAndValidateDbScoreList({
      scores: [{ ...score, value: NaN }],
      dataTypes: ["NUMERIC"],
    });

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "Score parsing error: ",
      expect.any(z.ZodError),
    );
  });
});
