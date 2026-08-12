import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TraceTruncationNotice } from "@/src/features/traces/components/TraceTruncationNotice";

const { mockUseTraceData } = vi.hoisted(() => ({ mockUseTraceData: vi.fn() }));

vi.mock("@/src/features/traces/contexts/TraceDataContext", () => ({
  useTraceData: () => mockUseTraceData(),
}));

describe("TraceTruncationNotice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("states the cap the server actually applied", () => {
    // Never a hard-coded 10,000: the cap is server-owned and will change.
    mockUseTraceData.mockReturnValue({
      truncatedAtObservations: 25_000,
      detachedObservationId: null,
    });

    render(<TraceTruncationNotice />);

    expect(
      screen.getByText(/Showing the first 25,000 observations/),
    ).toBeInTheDocument();
    // An overflow flag is not a count — the copy must not promise a total.
    expect(screen.queryByText(/of 25,001|total/)).not.toBeInTheDocument();
  });

  it("explains the separately loaded observation only when one is shown", () => {
    mockUseTraceData.mockReturnValue({
      truncatedAtObservations: 10_000,
      detachedObservationId: "obs-past-cap",
    });
    const { unmount } = render(<TraceTruncationNotice />);
    expect(screen.getByText(/loaded separately/)).toBeInTheDocument();
    unmount();

    mockUseTraceData.mockReturnValue({
      truncatedAtObservations: 10_000,
      detachedObservationId: null,
    });
    render(<TraceTruncationNotice />);
    expect(screen.queryByText(/loaded separately/)).not.toBeInTheDocument();
  });

  it("stays dismissed until the message gains new information", () => {
    mockUseTraceData.mockReturnValue({
      truncatedAtObservations: 10_000,
      detachedObservationId: null,
    });
    const { rerender } = render(<TraceTruncationNotice />);

    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();

    // A re-render with the same message must not bring it back...
    rerender(<TraceTruncationNotice />);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();

    // ...but opening an observation outside the loaded list adds a sentence, and
    // that is new information rather than the same notice nagging again.
    mockUseTraceData.mockReturnValue({
      truncatedAtObservations: 10_000,
      detachedObservationId: "obs-past-cap",
    });
    rerender(<TraceTruncationNotice />);
    expect(screen.getByText(/loaded separately/)).toBeInTheDocument();
  });

  it("renders nothing for a trace under the cap", () => {
    mockUseTraceData.mockReturnValue({
      truncatedAtObservations: undefined,
      detachedObservationId: null,
    });

    const { container } = render(<TraceTruncationNotice />);

    expect(container).toBeEmptyDOMElement();
  });
});
