import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSelectedObservation } from "@/src/features/traces/hooks/useSelectedObservation";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";

const { mockByIdQuery } = vi.hoisted(() => ({ mockByIdQuery: vi.fn() }));

vi.mock("@/src/utils/api", () => ({
  api: {
    observations: {
      byId: {
        useQuery: (input: unknown, options: unknown) =>
          mockByIdQuery(input, options),
      },
    },
  },
}));

const observation = (id: string) =>
  ({
    id,
    traceId: "t",
    startTime: new Date("2026-08-12T00:00:00.000Z"),
    type: "SPAN",
  }) as unknown as ObservationReturnTypeWithMetadata;

const loaded = [observation("in-list")];

const render = (selectedNodeId: string | null) =>
  renderHook(() =>
    useSelectedObservation({
      selectedNodeId,
      traceId: "t",
      projectId: "p",
      observations: loaded,
    }),
  ).result.current;

const queryEnabled = () => mockByIdQuery.mock.calls[0]?.[1]?.enabled;

describe("useSelectedObservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockByIdQuery.mockReturnValue({ data: undefined, error: null });
  });

  it("resolves an observation outside the loaded list by id instead of falling back to the trace", () => {
    // The tree's observation list is capped, so nodeMap/observations miss the
    // chronological tail — the panel must still show that observation.
    mockByIdQuery.mockReturnValue({
      data: { ...observation("past-cap"), traceId: null },
      error: null,
    });

    const result = render("past-cap");

    expect(result).toMatchObject({
      kind: "observation",
      isOutsideLoadedList: true,
    });
    expect(queryEnabled()).toBe(true);
    // traceId is nullable on the by-id row; the fetch was scoped to this trace.
    expect(
      result.kind === "observation" ? result.observation.traceId : null,
    ).toBe("t");
  });

  it("serves a loaded observation from the list without firing a request", () => {
    const result = render("in-list");

    expect(result).toEqual({
      kind: "observation",
      observation: loaded[0],
      isOutsideLoadedList: false,
    });
    expect(queryEnabled()).toBe(false);
  });

  it.each([null, "trace-t"])(
    "treats %s as the trace selection and fires no request",
    (selectedNodeId) => {
      expect(render(selectedNodeId)).toEqual({ kind: "trace" });
      expect(queryEnabled()).toBe(false);
    },
  );

  it.each([
    { code: "NOT_FOUND", kind: "not-found" },
    // A transient failure must not be reported as a deleted observation.
    { code: "INTERNAL_SERVER_ERROR", kind: "error" },
    { code: undefined, kind: "loading" },
  ])("reports $code as $kind", ({ code, kind }) => {
    mockByIdQuery.mockReturnValue({
      data: undefined,
      error: code ? { data: { code } } : null,
    });

    expect(render("past-cap")).toEqual({ kind, observationId: "past-cap" });
  });
});
