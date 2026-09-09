import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { SessionConversationTimelineTrace } from "@/src/features/annotation-queues/components/session/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { prepareSessionTimelineObservations } from "@/src/features/annotation-queues/components/session/SessionConversationTimeline/fns/prepareSessionTimelineObservations";

type TraceProps = ComponentProps<typeof SessionConversationTimelineTrace>;
type Observation = Extract<
  TraceProps["state"],
  { type: "loaded" }
>["observations"][number]["observation"];

const observation = (
  id: string,
  parentObservationId: string | null,
  type: string,
  startTime: Date,
) =>
  ({
    id,
    traceId: "trace-1",
    parentObservationId,
    name: id,
    type,
    startTime,
    input: type === "TOOL" ? "input" : [],
    output: type === "TOOL" ? "output" : [],
    metadata: null,
    latency: null,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  }) as Observation;

const observations = prepareSessionTimelineObservations([
  observation("parent", null, "AGENT", new Date(0)),
  observation("child", "parent", "AGENT", new Date(1)),
  observation("grandchild", "child", "TOOL", new Date(2)),
]);

const trace = {
  id: "trace-1",
  name: "Trace",
  timestamp: new Date(0),
  environment: "production",
  userId: null,
  observationCount: 3,
  latencyMs: 1,
  scores: [],
} satisfies TraceProps["trace"];

describe("SessionConversationTimelineTrace", () => {
  it("expands every parent when an observation scroll is requested", async () => {
    const props = {
      trace,
      turnNumber: 1,
      state: { type: "loaded", observations } as const,
      onOpenTrace: vi.fn(),
      onOpenObservation: vi.fn(),
      scrollTarget: null,
    } satisfies TraceProps;
    const { rerender } = render(
      <SessionConversationTimelineTrace {...props} />,
    );

    expect(screen.queryByText("grandchild")).not.toBeInTheDocument();

    rerender(
      <SessionConversationTimelineTrace
        {...props}
        scrollTarget={{ observationId: "grandchild", requestId: 1 }}
      />,
    );

    expect(screen.getByText("grandchild")).toBeInTheDocument();
    const parentToggle = screen.getByRole("button", {
      name: "Hide 1 tool",
    });
    fireEvent.click(parentToggle);
    expect(screen.queryByText("grandchild")).not.toBeInTheDocument();

    rerender(
      <SessionConversationTimelineTrace
        {...props}
        scrollTarget={{ observationId: "grandchild", requestId: 2 }}
      />,
    );

    expect(screen.getByText("grandchild")).toBeInTheDocument();
  });
});
