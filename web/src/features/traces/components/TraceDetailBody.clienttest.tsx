import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { TraceDetailBody } from "./TraceDetailBody";

vi.mock("@/src/features/traces/components/Trace", () => ({
  Trace: ({ trace }: { trace: { id: string } }) => (
    <input aria-label="trace state" defaultValue={trace.id} />
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

function trace(id: string): TraceDetailData {
  return { id } as unknown as TraceDetailData;
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
});
