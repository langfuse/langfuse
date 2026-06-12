import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  greptimeQuery: vi.fn(),
  writeRawEvents: vi.fn(),
}));

vi.mock("./client", () => ({
  greptimeQuery: mocks.greptimeQuery,
}));

vi.mock("./rawEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./rawEvents")>()),
  writeRawEvents: mocks.writeRawEvents,
}));

import {
  deleteEntitiesFromGreptime,
  deleteProjectFromGreptime,
  deleteTracesFromGreptime,
} from "./deletion";

describe("Greptime deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.greptimeQuery.mockResolvedValue([]);
    mocks.writeRawEvents.mockResolvedValue(undefined);
  });

  it("deletes entity projection and EAV rows with project scoping", async () => {
    await deleteEntitiesFromGreptime({
      projectId: "project-1",
      entityType: "score",
      entityIds: ["score-1"],
    });

    expect(mocks.writeRawEvents).toHaveBeenCalledOnce();
    expect(mocks.writeRawEvents.mock.calls[0]?.[0]).toMatchObject([
      {
        projectId: "project-1",
        entityType: "score",
        entityId: "score-1",
        eventType: "langfuse-tombstone",
      },
    ]);
    expect(mocks.greptimeQuery).toHaveBeenCalledTimes(3);
    expect(mocks.greptimeQuery.mock.calls.map(([arg]) => arg.params)).toEqual([
      ["project-1", "score-1"],
      ["project-1", "score-1"],
      ["project-1", "score-1"],
    ]);
    expect(mocks.greptimeQuery.mock.calls.map(([arg]) => arg.query)).toEqual([
      "DELETE FROM `scores` WHERE `project_id` = ? AND `id` = ?",
      "DELETE FROM `scores_metadata` WHERE `project_id` = ? AND `entity_id` = ?",
      "DELETE FROM `scores_tags` WHERE `project_id` = ? AND `entity_id` = ?",
    ]);
  });

  it("deletes traces and child observations/scores resolved from projections", async () => {
    mocks.greptimeQuery
      .mockResolvedValueOnce([{ id: "obs-1" }, { id: "obs-2" }])
      .mockResolvedValueOnce([{ id: "score-1" }])
      .mockResolvedValue([]);

    await deleteTracesFromGreptime({
      projectId: "project-1",
      traceIds: ["trace-1"],
    });

    expect(mocks.greptimeQuery.mock.calls[0]?.[0]).toMatchObject({
      params: ["project-1", "trace-1"],
      readOnly: true,
    });
    expect(mocks.greptimeQuery.mock.calls[0]?.[0].query).toContain(
      "FROM `observations`",
    );
    expect(mocks.greptimeQuery.mock.calls[1]?.[0]).toMatchObject({
      params: ["project-1", "trace-1"],
      readOnly: true,
    });
    expect(mocks.greptimeQuery.mock.calls[1]?.[0].query).toContain(
      "FROM `scores`",
    );
    const tombstonedEntityIds = mocks.writeRawEvents.mock.calls
      .flatMap(([rows]) => rows)
      .map((row) => row.entityId)
      .sort();
    expect(tombstonedEntityIds).toEqual([
      "obs-1",
      "obs-2",
      "score-1",
      "trace-1",
    ]);
  });

  it("deletes every project-scoped projection table for project deletion", async () => {
    await deleteProjectFromGreptime("project-1");

    expect(mocks.greptimeQuery).toHaveBeenCalledTimes(10);
    expect(mocks.greptimeQuery.mock.calls).toEqual(
      expect.arrayContaining([
        [
          {
            query: "DELETE FROM `traces` WHERE `project_id` = ?",
            params: ["project-1"],
          },
        ],
        [
          {
            query: "DELETE FROM `dataset_run_items` WHERE `project_id` = ?",
            params: ["project-1"],
          },
        ],
      ]),
    );
  });
});
