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
    detachedObservationIsMisplaced?: boolean;
  } = {},
) =>
  mockUseTraceData.mockReturnValue({
    truncatedAtObservations: 10_000,
    detachedObservationId: null,
    detachedObservationIsMisplaced: false,
    ...overrides,
  });

const dismiss = () => fireEvent.click(screen.getByLabelText("Dismiss"));
const isVisible = () => !!screen.queryByText(/Showing the first/);

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
    // between a misplaced observation and a tree implying it is top-level.
    { misplaced: true, claimsPosition: true },
    // A row that nests correctly, or a genuine root, gets no position claim.
    { misplaced: false, claimsPosition: false },
  ])(
    "claims a wrong position only when there is one (misplaced=$misplaced)",
    ({ misplaced, claimsPosition }) => {
      traceData({
        detachedObservationId: "obs-past-cap",
        detachedObservationIsMisplaced: misplaced,
      });

      render(<TraceTruncationNotice />);

      expect(screen.getByText(/loaded separately/)).toBeInTheDocument();
      expect(!!screen.queryByText(/appears at the top level/)).toBe(
        claimsPosition,
      );
    },
  );

  it("re-shows only for a message that says more, never on the way back", () => {
    traceData();
    const { rerender } = render(<TraceTruncationNotice />);
    dismiss();
    expect(isVisible()).toBe(false);

    // A re-render with the same message must not bring it back...
    rerender(<TraceTruncationNotice />);
    expect(isVisible()).toBe(false);

    // ...but opening an observation outside the loaded list adds a sentence, and
    // that is new information rather than the same notice nagging again.
    traceData({ detachedObservationId: "obs-past-cap" });
    rerender(<TraceTruncationNotice />);
    expect(screen.getByText(/loaded separately/)).toBeInTheDocument();

    // Dismiss that one and select a normal row again: selection flips the
    // message BACK, and it must stay gone instead of re-appearing on every
    // click across that boundary.
    dismiss();
    traceData();
    rerender(<TraceTruncationNotice />);
    expect(isVisible()).toBe(false);

    // But the out-of-position caveat says strictly more than what was
    // dismissed, and it is the only warning that row gets — so it still shows.
    traceData({
      detachedObservationId: "obs-past-cap",
      detachedObservationIsMisplaced: true,
    });
    rerender(<TraceTruncationNotice />);
    expect(screen.getByText(/appears at the top level/)).toBeInTheDocument();
  });

  it("renders nothing for a trace under the cap", () => {
    traceData({ truncatedAtObservations: undefined });

    const { container } = render(<TraceTruncationNotice />);

    expect(container).toBeEmptyDOMElement();
  });
});
