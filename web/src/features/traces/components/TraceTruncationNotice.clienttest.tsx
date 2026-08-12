import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TraceTruncationNotice } from "@/src/features/traces/components/TraceTruncationNotice";

const { mockUseTraceData } = vi.hoisted(() => ({ mockUseTraceData: vi.fn() }));

vi.mock("@/src/features/traces/contexts/TraceDataContext", () => ({
  useTraceData: () => mockUseTraceData(),
}));

const traceData = (
  overrides: {
    truncatedAtObservations?: number;
    detachedObservationId?: string | null;
    detachedObservationPlacement?: string | null;
  } = {},
) =>
  mockUseTraceData.mockReturnValue({
    truncatedAtObservations: 10_000,
    detachedObservationId: null,
    detachedObservationPlacement: null,
    ...overrides,
  });

describe("TraceTruncationNotice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("states the cap the server actually applied", () => {
    // Never a hard-coded 10,000: the cap is server-owned and will change.
    traceData({ truncatedAtObservations: 25_000 });

    render(<TraceTruncationNotice />);

    expect(
      screen.getByText(/Showing the first 25,000 observations/),
    ).toBeInTheDocument();
    // An overflow flag is not a count — the copy must not promise a total.
    expect(screen.queryByText(/of 25,001|total/)).not.toBeInTheDocument();
  });

  it.each([
    // The row carries no marker of its own, so this copy is the only thing
    // between an orphaned observation and a tree implying it is top-level.
    { placement: "orphaned", claimsPosition: true },
    // A row that nests correctly, or a genuine root, gets no position claim.
    { placement: "nested", claimsPosition: false },
    { placement: "root", claimsPosition: false },
  ] as const)(
    "describes a $placement detached row without over-claiming",
    ({ placement, claimsPosition }) => {
      traceData({
        detachedObservationId: "obs-past-cap",
        detachedObservationPlacement: placement,
      });

      render(<TraceTruncationNotice />);

      expect(screen.getByText(/loaded separately/)).toBeInTheDocument();
      expect(!!screen.queryByText(/appears at the top level/)).toBe(
        claimsPosition,
      );
    },
  );

  it("re-shows only when the message gains information, never on the way back", () => {
    traceData();
    const { rerender } = render(<TraceTruncationNotice />);
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();

    // A re-render with the same message must not bring it back...
    rerender(<TraceTruncationNotice />);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();

    // ...but opening an observation outside the loaded list adds a sentence, and
    // that is new information rather than the same notice nagging again.
    traceData({
      detachedObservationId: "obs-past-cap",
      detachedObservationPlacement: "nested",
    });
    rerender(<TraceTruncationNotice />);
    expect(screen.getByText(/loaded separately/)).toBeInTheDocument();

    // Dismiss that one and select a normal row again: selection flips the
    // variant BACK, and the notice must stay gone instead of re-appearing on
    // every click across that boundary.
    fireEvent.click(screen.getByLabelText("Dismiss"));
    traceData();
    rerender(<TraceTruncationNotice />);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it("renders nothing for a trace under the cap", () => {
    traceData({ truncatedAtObservations: undefined });

    const { container } = render(<TraceTruncationNotice />);

    expect(container).toBeEmptyDOMElement();
  });
});
