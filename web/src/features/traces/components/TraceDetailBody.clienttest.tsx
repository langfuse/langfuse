import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { TraceDetailBody } from "./TraceDetailBody";

vi.mock("@/src/features/traces/components/Trace", () => ({
  Trace: ({
    trace,
    showObservationOnly,
  }: {
    trace: { id: string };
    showObservationOnly?: boolean;
  }) => (
    <>
      <input aria-label="trace state" defaultValue={trace.id} />
      {showObservationOnly ? <div>Observation details only</div> : null}
    </>
  ),
}));

type TraceDetailData = NonNullable<
  ComponentProps<typeof TraceDetailBody>["trace"]
>;

function sessionTrace(id: string): TraceDetailData {
  return {
    id,
    sessionId: "session-1",
    sessionTraceEntries: [],
  } as unknown as TraceDetailData;
}

function trace(id: string, sessionId?: string): TraceDetailData {
  return { id, sessionId } as unknown as TraceDetailData;
}

describe("TraceDetailBody", () => {
  it("keeps the session UI mounted when the active trace changes", () => {
    const { rerender } = render(
      <TraceDetailBody trace={sessionTrace("trace-1")} context="fullscreen" />,
    );
    const input = screen.getByRole("textbox", { name: "trace state" });
    fireEvent.change(input, { target: { value: "preserved" } });

    rerender(
      <TraceDetailBody trace={sessionTrace("trace-2")} context="fullscreen" />,
    );

    expect(screen.getByRole("textbox", { name: "trace state" })).toHaveValue(
      "preserved",
    );
  });

  it("keeps the UI mounted while pending session data replaces trace data", () => {
    const { rerender } = render(
      <TraceDetailBody
        trace={trace("trace-1", "session-1")}
        context="fullscreen"
        sessionScopeRequested
      />,
    );
    const input = screen.getByRole("textbox", { name: "trace state" });
    fireEvent.change(input, { target: { value: "preserved" } });

    rerender(
      <TraceDetailBody
        trace={sessionTrace("trace-1")}
        context="fullscreen"
        sessionScopeRequested
      />,
    );

    expect(screen.getByRole("textbox", { name: "trace state" })).toHaveValue(
      "preserved",
    );
  });

  it("remounts trace-scoped UI when the trace changes", () => {
    const { rerender } = render(
      <TraceDetailBody trace={trace("trace-1")} context="fullscreen" />,
    );
    const input = screen.getByRole("textbox", { name: "trace state" });
    fireEvent.change(input, { target: { value: "changed" } });

    rerender(<TraceDetailBody trace={trace("trace-2")} context="fullscreen" />);

    expect(screen.getByRole("textbox", { name: "trace state" })).toHaveValue(
      "trace-2",
    );
  });

  it("forwards observation-only display mode", () => {
    render(
      <TraceDetailBody
        trace={trace("trace-1")}
        context="fullscreen"
        showObservationOnly
      />,
    );

    expect(screen.getByText("Observation details only")).toBeInTheDocument();
  });
});
