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
const DAY = 24 * HOUR;
const cutoff = CORRECTION_SCORES_BILLABLE_FROM;
const beforeCutoff = new Date(cutoff.getTime() - HOUR);

const startOfUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
const utcDay = (date: Date) => date.toISOString().slice(0, 10);

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

it("counts CORRECTION score rows from the billing cutoff", async () => {
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
  // Each save is its own row. Billing counts rows, so all three count.
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
    startDate: startOfUtcDay(beforeCutoff),
    endDate: new Date(startOfUtcDay(cutoff).getTime() + DAY),
  });
  const countOn = (date: string) =>
    dayCounts.find(
      (row) => row.projectId === projectId && row.date.startsWith(date),
    )?.count ?? 0;

  // The numeric score, plus each post-cutoff correction row. The pre-cutoff
  // correction stays out.
  expect(intervalCounts.find((row) => row.projectId === projectId)?.count).toBe(
    4,
  );
  expect(countOn(utcDay(beforeCutoff))).toBe(1);
  expect(countOn(utcDay(cutoff))).toBe(3);
});
