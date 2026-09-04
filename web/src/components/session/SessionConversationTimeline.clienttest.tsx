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
  input: JSON.stringify([{ role: "user", content: "How does it work?" }]),
  output: JSON.stringify({
    role: "assistant",
    content: "It uses normalized messages.",
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: { name: "search", arguments: '{"query":"parser"}' },
      },
    ],
  }),
  metadata: {},
  latency: 1,
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
      turnNumber={1}
      idleGapSeconds={10 * 60}
      state={{
        type: "loaded",
        observations: [timelineObservation],
      }}
      showSystemPrompt={showSystemPrompt}
      onOpenTrace={vi.fn()}
      onOpenObservation={onOpenObservation}
    />,
  );

describe("SessionConversationTimeline", () => {
  it("renders observation messages produced by the normalized parser", () => {
    renderTimeline();

    expect(
      screen.getByRole("button", { name: /trace 1.*trace-1/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("+10 min idle")).toBeInTheDocument();
    const observationButton = screen.getByRole("button", {
      name: /Generate answer/i,
    });
    expect(observationButton).not.toHaveClass("sr-only");
    expect(observationButton.querySelector("span")).toHaveClass("font-normal");
    expect(screen.getByText("How does it work?")).toBeInTheDocument();
    expect(
      screen.getByText("It uses normalized messages."),
    ).toBeInTheDocument();
    expect(screen.getByText("search")).toBeInTheDocument();
  });

  it("renders a timeline-shaped loading state", () => {
    render(
      <SessionConversationTimeline
        trace={trace}
        turnNumber={1}
        idleGapSeconds={null}
        state={{ type: "loading" }}
        showSystemPrompt={true}
        onOpenTrace={vi.fn()}
        onOpenObservation={vi.fn()}
      />,
    );

    const loadingState = screen.getByRole("status", {
      name: "Loading conversation",
    });

    expect(
      loadingState.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(8);
    expect(loadingState.querySelector(".justify-end")).not.toBeNull();
    expect(loadingState.querySelector(".justify-start")).not.toBeNull();
  });

  it("renders truncated input and output as conversational messages", () => {
    const { container } = renderTimeline({
      timelineObservation: {
        ...observation,
        input: "Truncated user message…",
        output: "Truncated assistant message…",
        inputTruncated: true,
        outputTruncated: true,
      },
    });

    expect(
      screen.getByText("Truncated user message…").closest("article")
        ?.parentElement,
    ).toHaveClass("justify-end");
    expect(
      screen.getByText("Truncated assistant message…").closest("article")
        ?.parentElement,
    ).toHaveClass("justify-start");
    expect(screen.getAllByText("Content truncated")).toHaveLength(2);
    expect(
      screen.queryByText(
        "This observation is too large to parse in the session timeline.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open in trace view" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("renders supported normalized parts without tool results", () => {
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
    expect(screen.queryByText("Think")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reasoning" }));
    expect(screen.getByText("Think")).toBeVisible();
    expect(screen.queryByText("search")).not.toBeInTheDocument();
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
        input: JSON.stringify([{ role: "system", content: "Secret prompt" }]),
        output: null,
      },
      showSystemPrompt: false,
    });

    expect(screen.queryByText("Secret prompt")).not.toBeInTheDocument();
    expect(screen.getByLabelText("No conversational content")).toBeVisible();
  });

  it("collapses visible system prompts by default", () => {
    renderTimeline({
      timelineObservation: {
        ...observation,
        input: JSON.stringify([{ role: "system", content: "Secret prompt" }]),
        output: null,
      },
      showSystemPrompt: true,
    });

    expect(screen.queryByText("Secret prompt")).toBeNull();
    const systemPromptButton = screen.getByRole("button", {
      name: "System prompt",
    });
    expect(systemPromptButton.closest(".ph-no-capture")).toHaveClass(
      "justify-center",
    );
    expect(systemPromptButton).toHaveClass("font-normal");
    expect(systemPromptButton).not.toHaveClass("font-bold");

    fireEvent.click(systemPromptButton);
    const systemPrompt = screen.getByText("Secret prompt");
    expect(systemPrompt).toBeVisible();
    expect(systemPrompt.closest(".border-l")).toBeNull();
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
        input: "0",
        output: "false",
        outputTruncated: true,
      },
    });

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
  });

  it("expands and collapses tool observation input and output", () => {
    renderTimeline({
      timelineObservation: {
        ...observation,
        name: "Search documentation",
        type: "TOOL",
        input: '{"query":"session timeline"}',
        output: '{"matches":3}',
      },
    });

    expect(screen.queryByText('{"query":"session timeline"}')).toBeNull();

    const observationButton = screen.getByRole("button", {
      name: "Search documentation",
    });
    const expandButton = screen.getByRole("button", {
      name: "Expand Search documentation",
    });

    expect(expandButton.previousElementSibling).toBe(observationButton);

    fireEvent.click(expandButton);
    expect(screen.getByText('{"query":"session timeline"}')).toBeVisible();
    expect(screen.getByText('{"matches":3}')).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse Search documentation" }),
    );
    expect(screen.queryByText('{"query":"session timeline"}')).toBeNull();
  });

  it("opens the source observation from its timeline label", () => {
    const onOpenObservation = vi.fn();
    renderTimeline({ onOpenObservation });

    fireEvent.click(screen.getByRole("button", { name: /Generate answer/i }));
    expect(onOpenObservation).toHaveBeenCalledWith("observation-1");
  });
});
