import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEventsTraceData } from "./useEventsTraceData";

const {
  mockEventsQuery,
  mockRootIOQuery,
  mockScoresQuery,
  mockSessionTraceSummariesQuery,
  mockSessionObservationsQuery,
} = vi.hoisted(() => ({
  mockEventsQuery: vi.fn(),
  mockRootIOQuery: vi.fn(),
  mockScoresQuery: vi.fn(),
  mockSessionTraceSummariesQuery: vi.fn(),
  mockSessionObservationsQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      byTraceId: { useQuery: () => mockEventsQuery() },
      batchIO: { useQuery: () => mockRootIOQuery() },
      scoresForTrace: { useQuery: () => mockScoresQuery() },
    },
    sessions: {
      tracesFromEvents: {
        useQuery: () => mockSessionTraceSummariesQuery(),
      },
      observationsForSessionFromEvents: {
        useQuery: () => mockSessionObservationsQuery(),
      },
    },
  },
  sendAsPostOption: {},
}));

const timestamp = new Date("2024-01-01T00:00:00.000Z");
const rootObservation = {
  id: "observation-1",
  traceId: "trace-1",
  projectId: "project-1",
  environment: "default",
  type: "SPAN",
  startTime: timestamp,
  endTime: null,
  name: "Root span",
  metadata: "{}",
  parentObservationId: null,
  level: "DEFAULT",
  statusMessage: null,
  version: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  model: null,
  internalModelId: null,
  modelParameters: null,
  input: null,
  output: null,
  completionStartTime: null,
  promptId: null,
  promptName: null,
  promptVersion: null,
  latency: null,
  timeToFirstToken: null,
  usageDetails: {},
  costDetails: {},
  providedCostDetails: {},
  providedUsageDetails: {},
  inputCost: null,
  outputCost: null,
  totalCost: null,
  inputUsage: 0,
  outputUsage: 0,
  totalUsage: 0,
  usagePricingTierId: null,
  usagePricingTierName: null,
  toolDefinitions: null,
  toolCalls: null,
  toolCallNames: null,
  userId: null,
  sessionId: "session-1",
  traceName: "Trace name",
  release: null,
  tags: [],
  bookmarked: false,
  public: false,
  traceTags: [],
  traceTimestamp: timestamp,
  toolDefinitionsCount: null,
  toolCallsCount: null,
  inputPrice: null,
  outputPrice: null,
  totalPrice: null,
};

describe("useEventsTraceData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventsQuery.mockReturnValue({
      data: { observations: [rootObservation] },
      isLoading: false,
      error: null,
    });
    mockRootIOQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    mockScoresQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    mockSessionTraceSummariesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    mockSessionObservationsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
  });

  it("keeps trace data visible until session data replaces it", () => {
    const { result, rerender } = renderHook(() =>
      useEventsTraceData({
        projectId: "project-1",
        traceId: "trace-1",
        scopeToSession: true,
      }),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data?.id).toBe("trace-1");
    expect(result.current.data).not.toHaveProperty("sessionTraceEntries");

    mockSessionTraceSummariesQuery.mockReturnValue({
      data: [
        {
          id: "trace-1",
          name: "Trace name",
          timestamp,
          userId: null,
          environment: "default",
          latencyMs: null,
        },
      ],
      isLoading: false,
      error: null,
    });
    mockSessionObservationsQuery.mockReturnValue({
      data: { observations: [rootObservation] },
      isLoading: false,
      error: null,
    });
    rerender();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data?.sessionTraceEntries).toHaveLength(1);
  });

  it("does not mask a failed session request with trace data", () => {
    const error = new Error("Session request failed");
    mockSessionTraceSummariesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error,
    });
    mockSessionObservationsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() =>
      useEventsTraceData({
        projectId: "project-1",
        traceId: "trace-1",
        scopeToSession: true,
      }),
    );

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe(error);
  });

  it("returns trace data when session scope is unavailable", () => {
    mockEventsQuery.mockReturnValue({
      data: {
        observations: [{ ...rootObservation, sessionId: null }],
      },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() =>
      useEventsTraceData({
        projectId: "project-1",
        traceId: "trace-1",
        scopeToSession: true,
      }),
    );

    expect(result.current.isSessionScopeUnavailable).toBe(true);
    expect(result.current.data?.id).toBe("trace-1");
    expect(result.current.data).not.toHaveProperty("sessionTraceEntries");
  });
});
