import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";

// Created via vi.hoisted so they exist before the hoisted vi.mock factories run.
const {
  mockUseReadPath,
  mockUseSession,
  mockUseEventsTraceData,
  mockTracesQuery,
  mockTraceReadConfigQuery,
} = vi.hoisted(() => ({
  mockUseReadPath: vi.fn(),
  mockUseSession: vi.fn(),
  mockUseEventsTraceData: vi.fn(),
  mockTracesQuery: vi.fn(),
  mockTraceReadConfigQuery: vi.fn(),
}));

vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => mockUseReadPath(),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));
vi.mock("@/src/features/events/hooks/useEventsTraceData", () => ({
  useEventsTraceData: (args: unknown) => mockUseEventsTraceData(args),
}));
// The traces-table query hook always runs (it's a hook; enabled:false on the
// beta path), so it only needs to return a query-shaped object.
vi.mock("@/src/utils/api", () => ({
  api: {
    public: {
      traceReadConfig: {
        useQuery: (input: unknown, options: unknown) =>
          mockTraceReadConfigQuery(input, options),
      },
    },
    traces: {
      byIdWithObservationsAndScores: {
        useQuery: (input: unknown, options: unknown) =>
          mockTracesQuery(input, options),
      },
    },
  },
}));

const render = () =>
  renderHook(() => useTraceDetailData({ projectId: "p", traceId: "t" })).result
    .current;

describe("useTraceDetailData (beta / events path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReadPath.mockReturnValue({ isV4: true });
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockTraceReadConfigQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mockTracesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it("surfaces an UNAUTHORIZED error as isUnauthorized, not isNotFound", () => {
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: "UNAUTHORIZED" } },
      isWaitingForTrace: false,
      truncatedAtObservations: undefined,
    });
    const r = render();
    expect(r.isUnauthorized).toBe(true);
    // The two flags must be mutually exclusive — an access error is not a
    // missing trace (else the page shows "Trace not found" for a 403).
    expect(r.isNotFound).toBe(false);
    expect(r.isWaitingForTrace).toBe(false);
  });

  it("does NOT report a non-UNAUTHORIZED error (e.g. 500) as not-found", () => {
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: "INTERNAL_SERVER_ERROR" } },
      isWaitingForTrace: false,
      truncatedAtObservations: undefined,
    });
    const r = render();
    // A transient server error is neither "not found" nor "unauthorized".
    expect(r.isNotFound).toBe(false);
    expect(r.isUnauthorized).toBe(false);
    expect(r.isError).toBe(true);
    expect(r.isWaitingForTrace).toBe(false);
  });

  it("treats no-data-after-loading (no error) as a genuine not-found", () => {
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isWaitingForTrace: false,
      truncatedAtObservations: undefined,
    });
    const r = render();
    expect(r.isNotFound).toBe(true);
    expect(r.isUnauthorized).toBe(false);
    expect(r.isWaitingForTrace).toBe(false);
  });

  it("keeps isNotFound false while empty-result arrival retries are running", () => {
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isWaitingForTrace: true,
      truncatedAtObservations: undefined,
    });
    const r = render();
    expect(r.isWaitingForTrace).toBe(true);
    expect(r.isNotFound).toBe(false);
  });
});

describe("useTraceDetailData endpoint routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReadPath.mockReturnValue({ isV4: false });
    mockTraceReadConfigQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mockTracesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isFetching: false,
      failureCount: 0,
      error: null,
    });
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isWaitingForTrace: false,
      truncatedAtObservations: undefined,
    });
  });

  it("retries NOT_FOUND with arrival backoff and silences the 404 toast", () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });

    render();

    const options = mockTracesQuery.mock.calls[0]?.[1] as {
      retry: (
        failureCount: number,
        error: { data?: { code?: string } },
      ) => boolean;
      retryDelay: (
        failureCount: number,
        error: { data?: { code?: string } },
      ) => number;
      meta: { silentHttpCodes: number[] };
    };

    expect(options.retry(0, { data: { code: "NOT_FOUND" } })).toBe(true);
    expect(options.retry(3, { data: { code: "NOT_FOUND" } })).toBe(true);
    expect(options.retry(4, { data: { code: "NOT_FOUND" } })).toBe(false);
    expect(options.retry(0, { data: { code: "UNAUTHORIZED" } })).toBe(false);
    expect(options.retryDelay(0, { data: { code: "NOT_FOUND" } })).toBe(1_000);
    expect(options.retryDelay(3, { data: { code: "NOT_FOUND" } })).toBe(8_000);
    expect(options.meta.silentHttpCodes).toEqual([404]);
  });

  it("exposes isWaitingForTrace while NOT_FOUND retries are in flight", () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockTracesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      failureCount: 1,
      error: { data: { code: "NOT_FOUND" } },
    });

    const r = render();
    expect(r.isWaitingForTrace).toBe(true);
    expect(r.isNotFound).toBe(false);
  });

  it("exposes isNotFound only after NOT_FOUND retries are exhausted", () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockTracesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      failureCount: 5,
      error: { data: { code: "NOT_FOUND" } },
    });

    const r = render();
    expect(r.isWaitingForTrace).toBe(false);
    expect(r.isNotFound).toBe(true);
  });

  it.each(["dual", "events_only"] as const)(
    "uses events endpoints for unauthenticated users in %s mode",
    (v4WriteMode) => {
      mockUseSession.mockReturnValue({ status: "unauthenticated" });
      mockTraceReadConfigQuery.mockReturnValue({
        data: { v4WriteMode },
        isLoading: false,
      });

      render();

      expect(mockTracesQuery.mock.calls[0]?.[1]).toMatchObject({
        enabled: false,
      });
      expect(mockUseEventsTraceData).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
      );
    },
  );

  it("uses legacy endpoints for unauthenticated users in legacy mode", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    mockTraceReadConfigQuery.mockReturnValue({
      data: { v4WriteMode: "legacy" },
      isLoading: false,
    });

    render();

    expect(mockTracesQuery.mock.calls[0]?.[1]).toMatchObject({
      enabled: true,
    });
    expect(mockUseEventsTraceData).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("uses events endpoints for authenticated beta users", () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockUseReadPath.mockReturnValue({ isV4: true });

    render();

    expect(mockTracesQuery.mock.calls[0]?.[1]).toMatchObject({
      enabled: false,
    });
    expect(mockUseEventsTraceData).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("uses legacy endpoints for authenticated non-beta users", () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });

    render();

    expect(mockTracesQuery.mock.calls[0]?.[1]).toMatchObject({
      enabled: true,
    });
    expect(mockUseEventsTraceData).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("does not fetch while the trace id is missing (deep-link first render)", () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });

    renderHook(() =>
      useTraceDetailData({ projectId: "p", traceId: undefined }),
    );

    expect(mockTracesQuery.mock.calls[0]?.[1]).toMatchObject({
      enabled: false,
    });
    expect(mockUseEventsTraceData).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("waits for authentication status before selecting endpoints", () => {
    mockUseSession.mockReturnValue({ status: "loading" });

    const result = render();

    expect(mockTracesQuery.mock.calls[0]?.[1]).toMatchObject({
      enabled: false,
    });
    expect(mockUseEventsTraceData).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(result.isLoading).toBe(true);
    expect(result.isNotFound).toBe(false);
  });

  it("waits for runtime config before routing unauthenticated users", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    mockTraceReadConfigQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const result = render();

    expect(mockTracesQuery.mock.calls[0]?.[1]).toMatchObject({
      enabled: false,
    });
    expect(mockUseEventsTraceData).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(result.isLoading).toBe(true);
    expect(result.isNotFound).toBe(false);
  });
});
