import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type TraceDataTrace } from "../types/traceScope";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { useSessionScopeData } from "./useSessionScopeData";
import { useSessionTraceData } from "./useSessionTraceData";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  adapt: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    sessions: {
      observationsForSessionFromEvents: {
        useQuery: (input: unknown, options: unknown) =>
          mocks.query(input, options),
      },
    },
  },
}));
vi.mock("@/src/features/events/lib/eventsToTraceAdapter", () => ({
  adaptEventsToTraceFormat: (input: unknown) => mocks.adapt(input),
}));

const trace: TraceDataTrace = {
  id: "anchor",
  projectId: "project",
  sessionId: "session",
  name: "Full anchor trace",
  input: "loaded input",
  output: "loaded output",
  metadata: "{}",
  timestamp: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  public: false,
  bookmarked: false,
  release: null,
  version: null,
  userId: null,
  tags: [],
  environment: "default",
};

// Only identity and the overwritten metadata matter to the merge.
const loadedObservation = {
  id: "observation",
  traceId: "anchor",
  metadata: "loaded metadata",
} as ObservationReturnTypeWithMetadata;

const input = {
  projectId: "project",
  trace,
  observations: [loadedObservation],
  scores: [],
  corrections: [],
  scopeToSession: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReturnValue({
    data: {
      observations: [
        { id: "observation", traceId: "anchor" },
        { id: "other-observation", traceId: "other" },
        { id: "unscoped", traceId: null },
      ],
      scores: [],
      corrections: [],
      cutoffObservationsAfterMaxCount: true,
      maxObservationsPerSession: 2,
    },
  });
  mocks.adapt.mockImplementation(
    ({
      traceId,
      events,
    }: {
      traceId: string;
      events: { id: string; traceId: string }[];
    }) => ({
      trace: { ...trace, id: traceId, input: null },
      observations: events,
    }),
  );
});

describe("session trace data", () => {
  it("adapts each trace once and preserves the session cap metadata", () => {
    const { result } = renderHook(() =>
      useSessionTraceData({ projectId: "project", sessionId: "session" }),
    );
    expect(mocks.adapt).toHaveBeenCalledTimes(2);
    expect(result.current.data?.traces.map((entry) => entry.id)).toEqual([
      "anchor",
      "other",
    ]);
    expect(result.current.data?.observations).toHaveLength(2);
    expect(result.current.data?.maxObservationsPerSession).toBe(2);
    expect(mocks.query).toHaveBeenCalledWith(
      { projectId: "project", sessionId: "session" },
      expect.objectContaining({
        enabled: true,
        retry: false,
        staleTime: 60_000,
      }),
    );
  });

  it("overlays the loaded trace and observations instead of losing their full data", () => {
    const { result } = renderHook(() => useSessionScopeData(input));
    expect(result.current.sessionData?.traces[0]).toBe(trace);
    expect(result.current.sessionData?.observations).toContain(
      loadedObservation,
    );
    expect(result.current.sessionData?.observations).toHaveLength(2);
  });

  it("preserves an anchor trace and observations missing from the capped session", () => {
    mocks.query.mockReturnValue({
      data: { observations: [], scores: [], corrections: [] },
    });
    const { result } = renderHook(() => useSessionScopeData(input));
    expect(result.current.sessionData?.traces).toEqual([trace]);
    expect(result.current.sessionData?.observations).toEqual([
      loadedObservation,
    ]);
  });

  it.each([
    { scopeToSession: false, isPlaceholderData: false },
    { scopeToSession: true, isPlaceholderData: true },
  ])("does not fetch for an inactive or placeholder scope: %s", (state) => {
    renderHook(() => useSessionScopeData({ ...input, ...state }));
    expect(mocks.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("does not expose session data when returning to trace scope", () => {
    const { result } = renderHook(() =>
      useSessionScopeData({ ...input, scopeToSession: false }),
    );
    expect(result.current.sessionData).toBeUndefined();
  });
});
