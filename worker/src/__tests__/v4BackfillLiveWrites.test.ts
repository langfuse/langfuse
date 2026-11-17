import { describe, expect, it } from "vitest";
import { v4 } from "uuid";
import {
  commandClickhouse,
  createEvent,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import CreateRootSpansFromTraces from "../backgroundMigrations/createRootSpansFromTraces";
import RewriteObservationsToPidTidSorting from "../backgroundMigrations/rewriteObservationsToPidTidSorting";
import { LiveWriteChunkTodo } from "../backgroundMigrations/utils/liveWriteWindow";
import { pidTidSortingTable } from "../backgroundMigrations/utils/v4BackfillDdl";

class RootSpansStep extends CreateRootSpansFromTraces {
  chunkQuery(todo: LiveWriteChunkTodo) {
    return this.buildChunkQuery(todo);
  }
}

class PidTidSortingStep extends RewriteObservationsToPidTidSorting {
  chunkQuery(todo: LiveWriteChunkTodo) {
    return this.buildChunkQuery(todo);
  }
  createScratchTable() {
    return this.afterTablesValidated();
  }
}

const runChunk = async (chunk: {
  query: string;
  params: Record<string, unknown>;
}) =>
  commandClickhouse({
    query: chunk.query,
    params: chunk.params,
    tags: { surface: "worker", route: "test.v4BackfillLiveWrites" },
  });

// A month no other suite writes to: every chunk query covers the whole
// partition, across projects.
const PARTITION = "200303";
const liveWriteStart = new Date("2003-03-10T12:00:00.000Z");
const at = (minutes: number) =>
  new Date(liveWriteStart.getTime() + minutes * 60_000);

describe("V4 historic backfill during dual write", () => {
  it("copies legacy rows written before dual write, and overlap rows without a live copy", async () => {
    const projectId = v4();

    const legacyTrace = (eventTs: Date) => {
      const trace = createTrace({
        project_id: projectId,
        timestamp: eventTs,
        created_at: eventTs,
        updated_at: eventTs,
        event_ts: eventTs,
      });
      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
        parent_observation_id: null,
        start_time: eventTs,
        created_at: eventTs,
        updated_at: eventTs,
        event_ts: eventTs,
      });
      return { trace, observation };
    };

    const beforeDualWrite = legacyTrace(at(-24 * 60));
    // Direct write: the same spans are already in the events tables.
    const directWrite = legacyTrace(at(5));
    // A worker that had not switched to dual write yet.
    const legacyOnlyInOverlap = legacyTrace(at(20));
    const afterOverlap = legacyTrace(at(120));
    const all = [
      beforeDualWrite,
      directWrite,
      legacyOnlyInOverlap,
      afterOverlap,
    ];

    await createTracesCh(all.map((t) => t.trace));
    await createObservationsCh(all.map((t) => t.observation));
    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: directWrite.trace.id,
        span_id: directWrite.observation.id,
        id: directWrite.observation.id,
        parent_span_id: "",
        is_app_root: true,
        source: "otel",
        start_time: directWrite.observation.start_time,
        created_at: at(5),
        updated_at: at(5),
        event_ts: at(5),
      }),
    ]);

    const todo: LiveWriteChunkTodo = {
      id: `p-${PARTITION}`,
      partition: PARTITION,
      status: "pending",
      liveWriteWindow: {
        start: liveWriteStart.toISOString(),
        overlapEnd: at(60).toISOString(),
        lookupEnd: at(120).toISOString(),
      },
    };

    await runChunk(new RootSpansStep().chunkQuery(todo));
    const pidTidSorting = new PidTidSortingStep();
    await pidTidSorting.createScratchTable();
    await runChunk(pidTidSorting.chunkQuery(todo));

    const virtualRoots = await queryClickhouse<{ trace_id: string }>({
      query: `
        SELECT trace_id FROM events_full
        WHERE project_id = {projectId: String}
          AND span_id = concat('t-', trace_id)
      `,
      params: { projectId },
    });
    const scratchObservations = await queryClickhouse<{ id: string }>({
      query: `
        SELECT id FROM ${pidTidSortingTable()}
        WHERE project_id = {projectId: String}
      `,
      params: { projectId },
    });

    const expected = [beforeDualWrite, legacyOnlyInOverlap];
    expect(virtualRoots.map((r) => r.trace_id).sort()).toEqual(
      expected.map((t) => t.trace.id).sort(),
    );
    expect(scratchObservations.map((r) => r.id).sort()).toEqual(
      expected.map((t) => t.observation.id).sort(),
    );
  });
});
