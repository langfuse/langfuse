import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/ui/MarkdownViewer", () => ({
  MarkdownView: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}));

vi.mock("@/src/components/ui/PrettyJsonView", () => ({
  PrettyJsonView: ({ json, title }: { json: unknown; title?: string }) => (
    <div>
      {title}
      {JSON.stringify(json)}
    </div>
  ),
}));

vi.mock("@/src/components/ui/LangfuseMediaView", () => ({
  LangfuseMediaView: () => <div>Media</div>,
}));

import { SessionConversationTimeline } from "@/src/components/session/SessionConversationTimeline";
import { SessionTimelineMessage } from "@/src/components/session/SessionTimelineMessage";

type TimelineProps = ComponentProps<typeof SessionConversationTimeline>;
type LoadedState = Extract<TimelineProps["state"], { type: "loaded" }>;
type Observation = LoadedState["observations"][number];

const trace = {
  id: "trace-1",
  name: "Answer question",
  timestamp: new Date("2026-01-01T12:00:00.000Z"),
  environment: "production",
  userId: "user-1",
  observationCount: 1,
  latencyMs: 1000,
  scores: [],
} satisfies TimelineProps["trace"];

const observation = {
  id: "observation-1",
  name: "Generate answer",
  type: "GENERATION",
  startTime: new Date("2026-01-01T12:00:00.000Z"),
  input: [{ role: "user", content: "How does it work?" }],
  output: {
    role: "assistant",
    content: "It uses normalized messages.",
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: { name: "search", arguments: '{"query":"parser"}' },
      },
    ],
  },
  metadata: {},
  inputTruncated: false,
  outputTruncated: false,
  metadataTruncated: false,
} as unknown as Observation;

const renderTimeline = ({
  timelineObservation = observation,
  showSystemPrompt = true,
  onOpenObservation = vi.fn(),
}: {
  timelineObservation?: Observation;
  showSystemPrompt?: boolean;
  onOpenObservation?: (observationId: string) => void;
} = {}) =>
  render(
    <SessionConversationTimeline
      trace={trace}
      state={{
        type: "loaded",
        observations: [timelineObservation],
        hasMoreObservations: false,
      }}
      showSystemPrompt={showSystemPrompt}
      onOpenTrace={vi.fn()}
      onOpenObservation={onOpenObservation}
    />,
  );

describe("SessionConversationTimeline", () => {
  it("renders observation messages produced by the normalized parser", () => {
    renderTimeline();

    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("How does it work?")).toBeInTheDocument();
    expect(screen.getByText("Assistant")).toBeInTheDocument();
    expect(
      screen.getByText("It uses normalized messages."),
    ).toBeInTheDocument();
    expect(screen.getByText("Tool call: search")).toBeInTheDocument();
  });

  it("renders each normalized part type without projecting to ChatML", () => {
    render(
      <SessionTimelineMessage
        message={{
          role: "assistant",
          source: "output",
          parts: [
            { type: "reasoning", content: { kind: "text", text: "Think" } },
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "search",
              output: { result: "found" },
            },
            { type: "data", value: { confidence: 0.9 } },
            { type: "custom", kind: "citation", value: { id: "doc-1" } },
          ],
        }}
      />,
    );

    expect(screen.getByText("Reasoning")).toBeInTheDocument();
    expect(screen.getByText("Tool result: search")).toBeInTheDocument();
    expect(screen.getByText('{"confidence":0.9}')).toBeInTheDocument();
    expect(screen.getByText(/citation/)).toBeInTheDocument();
  });

  it("does not link unsafe provider file URLs", () => {
    render(
      <SessionTimelineMessage
        message={{
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "file",
              content: { kind: "url", url: "javascript:alert(1)" },
            },
          ],
        }}
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/javascript:alert/)).toBeInTheDocument();
  });

  it("hides system messages when the display option is disabled", () => {
    renderTimeline({
      timelineObservation: {
        ...observation,
        input: [{ role: "system", content: "Secret prompt" }],
        output: null,
      },
      showSystemPrompt: false,
    });

    expect(screen.queryByText("Secret prompt")).not.toBeInTheDocument();
    expect(screen.getByText("No conversational content")).toBeInTheDocument();
  });

  it("reports omitted metadata while preserving parsed messages", () => {
    renderTimeline({
      timelineObservation: { ...observation, metadataTruncated: true },
    });

    expect(
      screen.getByText(/Metadata was omitted because it is too large/i),
    ).toBeInTheDocument();
    expect(screen.getByText("How does it work?")).toBeInTheDocument();
  });

  it("keeps falsy values in truncated observation previews", () => {
    renderTimeline({
      timelineObservation: {
        ...observation,
        input: 0,
        output: false,
        outputTruncated: true,
      },
    });

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
  });

  it("opens the source observation from its timeline label", () => {
    const onOpenObservation = vi.fn();
    renderTimeline({ onOpenObservation });

    fireEvent.click(screen.getByRole("button", { name: /Generate answer/i }));
    expect(onOpenObservation).toHaveBeenCalledWith("observation-1");
  });
});
