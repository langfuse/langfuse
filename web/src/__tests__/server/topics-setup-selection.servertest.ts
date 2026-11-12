import { randomUUID } from "crypto";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  getTopicSetupTraceNames,
} from "@langfuse/shared/src/server";
import { describe, expect, it } from "vitest";
import {
  countTopicSetupTraces,
  selectTopicSetupTraces,
} from "@/src/features/topics/server/traceSelection";

const HOUR_US = 3_600_000_000;

async function seedFinishedTrace(projectId: string, traceName: string) {
  const traceId = randomUUID();
  const now = Date.now() * 1000;
  // Two observations per trace: the setup reads count traces, not observations.
  await createEventsCh(
    ["root", "child"].map((name, index) => {
      const id = randomUUID();
      return createEvent({
        id,
        span_id: id,
        trace_id: traceId,
        project_id: projectId,
        parent_span_id: index === 0 ? "" : traceId,
        name,
        trace_name: traceName,
        start_time: now - 2 * HOUR_US,
        event_ts: now - HOUR_US,
      });
    }),
  );
  return traceId;
}

describe("Topics setup trace selection", () => {
  it("counts and backfills only the traces the rule filter matches", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const matching = await Promise.all([
      seedFinishedTrace(projectId, "rag.answer"),
      seedFinishedTrace(projectId, "rag.answer"),
    ]);
    await seedFinishedTrace(projectId, "chat.turn");
    const filter = [
      {
        column: "traceName",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["rag.answer"],
      },
    ];
    const now = new Date();

    await expect(
      countTopicSetupTraces({ projectId, filter: [], now }),
    ).resolves.toEqual({ finished7d: 3, finished30d: 3 });
    await expect(
      countTopicSetupTraces({ projectId, filter, now }),
    ).resolves.toEqual({ finished7d: 2, finished30d: 2 });
    const { traceIds } = await selectTopicSetupTraces({
      projectId,
      filter,
      sampling: 1,
      limit: 500,
      now,
    });
    expect(traceIds.toSorted()).toEqual(matching.toSorted());
  });

  it("suggests only stored trace names, never a root observation name", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await seedFinishedTrace(projectId, "rag.answer");
    // No stored trace name: the UI shows the root name "root", rule matching sees none.
    await seedFinishedTrace(projectId, "");

    await expect(
      getTopicSetupTraceNames({ projectId, now: new Date() }),
    ).resolves.toEqual([{ value: "rag.answer", count: 1 }]);
  });
});
