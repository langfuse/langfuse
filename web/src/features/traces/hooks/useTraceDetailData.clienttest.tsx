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
      truncatedAtObservations: undefined,
    });
    const r = render();
    expect(r.isUnauthorized).toBe(true);
    // The two flags must be mutually exclusive — an access error is not a
    // missing trace (else the page shows "Trace not found" for a 403).
    expect(r.isNotFound).toBe(false);
  });

  it("does NOT report a non-UNAUTHORIZED error (e.g. 500) as not-found", () => {
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: "INTERNAL_SERVER_ERROR" } },
      truncatedAtObservations: undefined,
    });
    const r = render();
    // A transient server error is neither "not found" nor "unauthorized".
    expect(r.isNotFound).toBe(false);
    expect(r.isUnauthorized).toBe(false);
    expect(r.isError).toBe(true);
  });

  it("reports a missing session as not-found", () => {
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: "NOT_FOUND" } },
      isSessionScopeUnavailable: false,
      truncatedAtObservations: undefined,
    });

    const r = render();

    expect(r.isNotFound).toBe(true);
    expect(r.isUnauthorized).toBe(false);
  });

  it("treats no-data-after-loading (no error) as a genuine not-found", () => {
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      truncatedAtObservations: undefined,
    });
    const r = render();
    expect(r.isNotFound).toBe(true);
    expect(r.isUnauthorized).toBe(false);
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
      error: null,
    });
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      truncatedAtObservations: undefined,
    });
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
        expect.objectContaining({ enabled: true, scopeToSession: false }),
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
      expect.objectContaining({ enabled: false, scopeToSession: false }),
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
      expect.objectContaining({ enabled: true, scopeToSession: true }),
    );
  });

  it("uses legacy endpoints for authenticated non-beta users", () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });

    render();

    expect(mockTracesQuery.mock.calls[0]?.[1]).toMatchObject({
      enabled: true,
    });
    expect(mockUseEventsTraceData).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, scopeToSession: true }),
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
      expect.objectContaining({ enabled: false, scopeToSession: true }),
    );
  });

  it("waits for authentication status before selecting endpoints", () => {
    mockUseSession.mockReturnValue({ status: "loading" });

    const result = render();

    expect(mockTracesQuery.mock.calls[0]?.[1]).toMatchObject({
      enabled: false,
    });
    expect(mockUseEventsTraceData).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, scopeToSession: true }),
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
      expect.objectContaining({ enabled: false, scopeToSession: false }),
    );
    expect(result.isLoading).toBe(true);
    expect(result.isNotFound).toBe(false);
  });
});
