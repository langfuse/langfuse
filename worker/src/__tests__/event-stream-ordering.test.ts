import {
  type FilterCondition,
  type OrderByState,
  normalizeOrderByForTable,
} from "@langfuse/shared";
import {
  createEvent,
  createEventsCh,
  getEventsStreamForEval,
  getObservationsWithModelDataFromEventsTable,
} from "@langfuse/shared/src/server";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { beforeAll, describe, expect, it } from "vitest";
import {
  getEventsStream,
  getEventsStreamForAnnotationQueue,
  getEventsStreamForDataset,
} from "../features/database-read-stream/event-stream";

const maybeDescribe =
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

type StreamInput = {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[];
  orderBy: OrderByState;
  rowLimit: number;
};

const streamAdapters: Array<{
  name: string;
  run: (input: StreamInput) => Promise<Readable>;
}> = [
  { name: "blob export", run: getEventsStream },
  { name: "dataset", run: getEventsStreamForDataset },
  { name: "annotation queue", run: getEventsStreamForAnnotationQueue },
  { name: "evaluation", run: getEventsStreamForEval },
];

const collectIds = async (stream: Readable): Promise<string[]> => {
  const ids: string[] = [];
  for await (const row of stream) {
    ids.push((row as { id: string }).id);
  }
  return ids;
};

maybeDescribe("event stream ordering parity", () => {
  const projectId = randomUUID();
  const cutoffCreatedAt = new Date(Date.now() + 60_000);
  const filter: FilterCondition[] = [];
  const eventIds = [randomUUID(), randomUUID(), randomUUID()];

  beforeAll(async () => {
    const baseTime = Date.now() - 10_000;
    await createEventsCh(
      eventIds.map((eventId, index) =>
        createEvent({
          id: eventId,
          span_id: eventId,
          project_id: projectId,
          trace_id: randomUUID(),
          name: "same-ordering-key",
          start_time: (baseTime + index * 1_000) * 1_000,
        }),
      ),
    );
  });

  it.each(["ASC", "DESC"] as const)(
    "selects the same first two event IDs as Fast Preview for timestamp %s",
    async (direction) => {
      const persistedOrderBy: OrderByState = {
        column: "timestamp",
        order: direction,
      };
      const fastPreviewOrderBy = normalizeOrderByForTable({
        orderBy: persistedOrderBy,
        expectedTimeColumn: "startTime",
      });
      const fastPreviewRows = await getObservationsWithModelDataFromEventsTable(
        {
          projectId,
          filter,
          orderBy: fastPreviewOrderBy,
          limit: 2,
          offset: 0,
        },
      );
      const expectedIds = fastPreviewRows.map((row) => row.id);

      expect(expectedIds).toEqual(
        direction === "ASC"
          ? eventIds.slice(0, 2)
          : eventIds.slice(1).reverse(),
      );

      for (const adapter of streamAdapters) {
        const actualIds = await collectIds(
          await adapter.run({
            projectId,
            cutoffCreatedAt,
            filter,
            orderBy: persistedOrderBy,
            rowLimit: 2,
          }),
        );

        expect(actualIds, adapter.name).toEqual(expectedIds);
      }
    },
    20_000,
  );

  it.each(["ASC", "DESC"] as const)(
    "uses the same ID tie-breaker as Fast Preview for name %s",
    async (direction) => {
      const orderBy: OrderByState = { column: "name", order: direction };
      const fastPreviewRows = await getObservationsWithModelDataFromEventsTable(
        {
          projectId,
          filter,
          orderBy,
          limit: 2,
          offset: 0,
        },
      );
      const sortedIds = [...eventIds].sort();
      const expectedIds = (
        direction === "ASC" ? sortedIds : sortedIds.reverse()
      ).slice(0, 2);

      expect(fastPreviewRows.map((row) => row.id)).toEqual(expectedIds);

      for (const adapter of streamAdapters) {
        const actualIds = await collectIds(
          await adapter.run({
            projectId,
            cutoffCreatedAt,
            filter,
            orderBy,
            rowLimit: 2,
          }),
        );

        expect(actualIds, adapter.name).toEqual(expectedIds);
      }
    },
    20_000,
  );

  it("orders the newest physical event version by its current value", async () => {
    const duplicateProjectId = randomUUID();
    const duplicateId = randomUUID();
    const controlId = randomUUID();
    const traceId = randomUUID();
    const startTime = (Date.now() - 10_000) * 1_000;
    const event = (
      id: string,
      name: string,
      output: string,
      eventTsOffset: number,
    ) =>
      createEvent({
        id,
        span_id: id,
        project_id: duplicateProjectId,
        trace_id: traceId,
        name,
        output,
        start_time: startTime,
        event_ts: startTime + eventTsOffset,
      });

    await createEventsCh([
      event(duplicateId, "a-stale", "stale", 1),
      event(controlId, "m-control", "control", 2),
    ]);
    await createEventsCh([event(duplicateId, "z-current", "current", 3)]);

    const rows: Array<{ id: string; output: unknown }> = [];
    for await (const row of await getEventsStreamForDataset({
      projectId: duplicateProjectId,
      cutoffCreatedAt,
      filter,
      orderBy: { column: "name", order: "ASC" },
      rowLimit: 2,
    })) {
      rows.push(row as { id: string; output: unknown });
    }

    expect(rows.map(({ id, output }) => ({ id, output }))).toEqual([
      { id: controlId, output: "control" },
      { id: duplicateId, output: "current" },
    ]);
  });
});
