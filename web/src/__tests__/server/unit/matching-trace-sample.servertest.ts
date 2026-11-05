import { extractValueFromObject } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { inferDefaultMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import { isObservationDataColumn } from "@/src/features/evals/v2/fns/variableMapping/traceVariableMapping";
import {
  matchingTraceRootLowerBound,
  orderRootsByMatchedTraceIds,
} from "@/src/features/events/server/matchingTraceRoots";

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

  it("reads threads and a path inside them, and rejects observation columns", () => {
    const threads = [
      { currentTurn: { messages: [{ role: "user", content: "hello" }] } },
    ];

    expect(extractValueFromObject({ threads }, "threads").value).toBe(threads);
    expect(
      extractValueFromObject(
        { threads },
        "threads",
        "$[0].currentTurn.messages[0].role",
      ).value,
    ).toBe("user");
    expect(isObservationDataColumn("output")).toBe(true);
    expect(isObservationDataColumn("toolCalls")).toBe(true);
    expect(isObservationDataColumn("experimentItemMetadata")).toBe(true);
    expect(isObservationDataColumn("threads")).toBe(false);
    expect(isObservationDataColumn(null)).toBe(false);
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
