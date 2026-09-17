import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { SessionConversationTimelineTrace } from "./SessionConversationTimelineTrace";
import { prepareSessionTimelineObservations } from "../../fns/prepareSessionTimelineObservations";

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
  observation("second-grandchild", "child", "TOOL", new Date(3)),
]);

const trace = {
  id: "trace-1",
  name: "Trace",
  timestamp: new Date(0),
  environment: "production",
  userId: null,
  observationCount: 4,
  latencyMs: 1,
  scores: [],
} satisfies TraceProps["trace"];

describe("SessionConversationTimelineTrace", () => {
  it("clears filters from a filtered empty state", () => {
    const onClearFilters = vi.fn();

    render(
      <SessionConversationTimelineTrace
        trace={trace}
        turnNumber={1}
        state={{
          type: "filtered-empty",
          viewLabel: null,
          onClearFilters,
        }}
        onOpenTrace={vi.fn()}
        onOpenObservation={vi.fn()}
        scrollTarget={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onClearFilters).toHaveBeenCalledOnce();
  });

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
      name: "Hide tools: grandchild and second-grandchild",
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

  it("always shows a single nested tool without a collapse control", () => {
    const loneToolObservations = prepareSessionTimelineObservations([
      observation("parent", null, "AGENT", new Date(0)),
      observation("tool", "parent", "TOOL", new Date(1)),
    ]);

    render(
      <SessionConversationTimelineTrace
        trace={{ ...trace, observationCount: 2 }}
        turnNumber={1}
        state={{ type: "loaded", observations: loneToolObservations }}
        onOpenTrace={vi.fn()}
        onOpenObservation={vi.fn()}
        scrollTarget={null}
      />,
    );

    expect(screen.getByText("tool")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /tools: tool/i }),
    ).not.toBeInTheDocument();
  });

  it("decodes Unicode escapes in truncated observation previews", () => {
    const truncated = prepareSessionTimelineObservations([
      {
        ...observation("gen", null, "GENERATION", new Date(0)),
        input: '{"text":"\\u4f60\\u597d"}',
        output: "\\u4f60\\u597d",
        inputTruncated: true,
        outputTruncated: true,
      },
    ]);

    render(
      <SessionConversationTimelineTrace
        trace={{ ...trace, observationCount: 1 }}
        turnNumber={1}
        state={{ type: "loaded", observations: truncated }}
        onOpenTrace={vi.fn()}
        onOpenObservation={vi.fn()}
        scrollTarget={null}
      />,
    );

    expect(screen.getAllByText(/你好/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\\u4f60\\u597d/)).not.toBeInTheDocument();
  });

  it("decodes Unicode escapes in full (non-truncated) timeline message text", () => {
    // Modern timeline hydrates full I/O via sessionBatchIO without truncation
    // flags; plain-string output still carries literal \uXXXX from storage.
    const loaded = prepareSessionTimelineObservations([
      {
        ...observation("gen", null, "GENERATION", new Date(0)),
        input: '[{"role":"user","content":"hi"}]',
        output: "\\u4f60\\u597d world",
      },
    ]);

    render(
      <SessionConversationTimelineTrace
        trace={{ ...trace, observationCount: 1 }}
        turnNumber={1}
        state={{ type: "loaded", observations: loaded }}
        onOpenTrace={vi.fn()}
        onOpenObservation={vi.fn()}
        scrollTarget={null}
      />,
    );

    expect(screen.getByText(/你好 world/)).toBeInTheDocument();
    expect(screen.queryByText(/\\u4f60\\u597d/)).not.toBeInTheDocument();
  });
});
