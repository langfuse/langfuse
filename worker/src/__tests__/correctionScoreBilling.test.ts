import { randomUUID } from "crypto";
import { afterEach, expect, it } from "vitest";
import { CORRECTION_SCORES_BILLABLE_FROM } from "@langfuse/shared";
import {
  createScoresCh,
  createTraceScore,
  deleteScoresByTraceIds,
  getScoreCountsByProjectAndDay,
  getScoreCountsByProjectInCreationInterval,
} from "@langfuse/shared/src/server";

const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;
const cutoff = CORRECTION_SCORES_BILLABLE_FROM;
const beforeCutoff = new Date(cutoff.getTime() - HOUR);

let projectId = "";
let traceId = "";

const correction = (at: Date, id: string) =>
  createTraceScore({
    id,
    project_id: projectId,
    trace_id: traceId,
    name: "output",
    data_type: "CORRECTION",
    value: 0,
    string_value: "corrected",
    long_string_value: "corrected output",
    timestamp: at,
    created_at: at,
    updated_at: at,
    event_ts: at,
  });

afterEach(async () => {
  if (projectId && traceId) {
    await deleteScoresByTraceIds(projectId, [traceId]);
  }
});

it("counts CORRECTION scores from the billing cutoff, once per score id", async () => {
  projectId = randomUUID();
  traceId = randomUUID();
  const repeatedCorrectionId = randomUUID();

  await createScoresCh([
    createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      name: "quality",
      data_type: "NUMERIC",
      timestamp: beforeCutoff,
      created_at: beforeCutoff,
      updated_at: beforeCutoff,
      event_ts: beforeCutoff,
    }),
    correction(beforeCutoff, randomUUID()),
  ]);
  // Separate inserts stay unmerged, so a raw count would bill each save.
  for (const extraMs of [0, SECOND, 2 * SECOND]) {
    await createScoresCh([
      correction(new Date(cutoff.getTime() + extraMs), repeatedCorrectionId),
    ]);
  }

  const intervalCounts = await getScoreCountsByProjectInCreationInterval({
    start: new Date(cutoff.getTime() - 2 * HOUR),
    end: new Date(cutoff.getTime() + 2 * HOUR),
    projectId,
  });
  const dayCounts = await getScoreCountsByProjectAndDay({
    startDate: new Date("2026-11-22T00:00:00.000Z"),
    endDate: new Date("2026-11-24T00:00:00.000Z"),
  });
  const countOn = (date: string) =>
    dayCounts.find(
      (row) => row.projectId === projectId && row.date.startsWith(date),
    )?.count ?? 0;

  // The numeric score, plus the post-cutoff correction once. The pre-cutoff
  // correction and the two later saves of the same id stay out.
  expect(intervalCounts.find((row) => row.projectId === projectId)?.count).toBe(
    2,
  );
  expect(countOn("2026-11-22")).toBe(1);
  expect(countOn("2026-11-23")).toBe(1);
});
