import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTraceDetailData } from "@/src/components/trace/useTraceDetailData";

// Created via vi.hoisted so they exist before the hoisted vi.mock factories run.
const { mockUseV4Beta, mockUseEventsTraceData, mockTracesQuery } = vi.hoisted(
  () => ({
    mockUseV4Beta: vi.fn(),
    mockUseEventsTraceData: vi.fn(),
    mockTracesQuery: vi.fn(),
  }),
);

vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => mockUseV4Beta(),
}));
vi.mock("@/src/features/events/hooks/useEventsTraceData", () => ({
  useEventsTraceData: (args: unknown) => mockUseEventsTraceData(args),
}));
// The traces-table query hook always runs (it's a hook; enabled:false on the
// beta path), so it only needs to return a query-shaped object.
vi.mock("@/src/utils/api", () => ({
  api: {
    traces: {
      byIdWithObservationsAndScores: { useQuery: () => mockTracesQuery() },
    },
  },
}));

const render = () =>
  renderHook(() => useTraceDetailData({ projectId: "p", traceId: "t" })).result
    .current;

describe("useTraceDetailData (beta / events path)", () => {
  beforeEach(() => {
    mockUseV4Beta.mockReturnValue({ isBetaEnabled: true });
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
      cutoffObservationsAfterMaxCount: false,
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
      cutoffObservationsAfterMaxCount: false,
    });
    const r = render();
    // A transient server error is neither "not found" nor "unauthorized".
    expect(r.isNotFound).toBe(false);
    expect(r.isUnauthorized).toBe(false);
    expect(r.isError).toBe(true);
  });

  it("treats no-data-after-loading (no error) as a genuine not-found", () => {
    mockUseEventsTraceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      cutoffObservationsAfterMaxCount: false,
    });
    const r = render();
    expect(r.isNotFound).toBe(true);
    expect(r.isUnauthorized).toBe(false);
  });
});
