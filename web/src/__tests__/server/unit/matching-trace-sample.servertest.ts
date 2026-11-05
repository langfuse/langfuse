import { describe, expect, it } from "vitest";

import { inferDefaultMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import {
  matchingTraceRootLowerBound,
  orderRootsByMatchedTraceIds,
} from "@/src/features/events/server/matchingTraceRoots";
import { threadsFromObservationIo } from "@/src/features/events/server/threadsFromObservationIo";

describe("matching trace sample", () => {
  it("keeps roots in matched-trace order and drops traces with no root", () => {
    const ordered = orderRootsByMatchedTraceIds(
      ["trace-b", "trace-a", "trace-c"],
      [
        { traceId: "trace-a", id: "root-a" },
        { traceId: "trace-c", id: "root-c" },
        { traceId: "trace-a", id: "root-a-later" },
      ],
    );

    expect(ordered.map((root) => root.id)).toEqual(["root-a", "root-c"]);
  });

  it("widens the root start time by the given day interval", () => {
    expect(
      matchingTraceRootLowerBound(
        new Date("2026-01-10T00:00:00.000Z"),
        2,
      ).toISOString(),
    ).toBe("2026-01-08T00:00:00.000Z");
  });

  it("assembles threads from the selected observation I/O", () => {
    const observation = {
      id: "gen-1",
      traceId: "trace-1",
      parentObservationId: null,
      name: "chat",
      startTime: new Date("2026-01-01T12:00:00.000Z"),
      endTime: new Date("2026-01-01T12:00:01.000Z"),
      input: JSON.stringify([{ role: "user", content: "Where is my order?" }]),
      output: JSON.stringify([
        { role: "assistant", content: "It arrives tomorrow." },
      ]),
      metadata: {},
    };

    const threads = threadsFromObservationIo({
      ...observation,
      type: "GENERATION",
    });

    expect(threads).toEqual([
      expect.objectContaining({
        currentTurn: expect.objectContaining({
          observations: [{ id: "gen-1", traceId: "trace-1" }],
        }),
      }),
    ]);
    expect(
      threadsFromObservationIo({ ...observation, type: "SPAN" }),
    ).toBeNull();
  });

  it("binds conversation to threads", () => {
    expect(inferDefaultMapping("conversation")).toEqual({
      selectedColumnId: "threads",
    });
    expect(inferDefaultMapping("Conversation")).toEqual({
      selectedColumnId: "threads",
    });
  });
});
