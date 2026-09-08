// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";

import {
  SessionConversationTimeline,
  type SessionObservation,
} from "@/src/components/session/SessionConversationTimeline/SessionConversationTimeline";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";

const trace = {
  id: "trace-1",
  name: "Coding agent turn",
} as EventSessionTrace;

const observation = ({
  id,
  parentObservationId,
  type,
  input,
  output,
  offset,
}: {
  id: string;
  parentObservationId: string | null;
  type: "AGENT" | "GENERATION" | "TOOL";
  input: unknown;
  output: unknown;
  offset: number;
}) =>
  ({
    id,
    traceId: trace.id,
    parentObservationId,
    type,
    name: id,
    startTime: new Date(offset),
    latency: 1,
    input,
    output,
    metadata: null,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  }) as SessionObservation;

describe("SessionConversationTimeline nested observations", () => {
  it("describes, expands, and collapses nested observation trees", () => {
    const prompt = [{ role: "user", content: "Build the dashboard" }];
    const observations = [
      observation({
        id: "opencode.turn",
        parentObservationId: null,
        type: "AGENT",
        input: prompt,
        output: "Finished the dashboard",
        offset: 0,
      }),
      observation({
        id: "generation-1",
        parentObservationId: "opencode.turn",
        type: "GENERATION",
        input: prompt,
        output: "Calling three tools",
        offset: 1,
      }),
      ...[1, 2, 3].map((toolNumber) =>
        observation({
          id: `tool-${toolNumber}`,
          parentObservationId: "generation-1",
          type: "TOOL",
          input: { toolNumber },
          output: { success: true },
          offset: 1 + toolNumber,
        }),
      ),
      observation({
        id: "generation-2",
        parentObservationId: "opencode.turn",
        type: "GENERATION",
        input: "Continue",
        output: "Calling two tools",
        offset: 5,
      }),
      ...[4, 5].map((toolNumber) =>
        observation({
          id: `tool-${toolNumber}`,
          parentObservationId: "generation-2",
          type: "TOOL",
          input: { toolNumber },
          output: { success: true },
          offset: 1 + toolNumber,
        }),
      ),
      observation({
        id: "leaf-generation",
        parentObservationId: null,
        type: "GENERATION",
        input: "Standalone prompt",
        output: "Standalone answer",
        offset: 8,
      }),
    ];

    const { container } = render(
      <MarkdownContextProvider>
        <SessionConversationTimeline
          trace={trace}
          turnNumber={1}
          idleGapSeconds={null}
          state={{ type: "loaded", observations }}
          onOpenTrace={vi.fn()}
          onOpenObservation={vi.fn()}
        />
      </MarkdownContextProvider>,
    );

    expect(screen.getByText("Build the dashboard")).toBeInTheDocument();
    expect(screen.getByText("Finished the dashboard")).toBeInTheDocument();
    const leafObservation = screen
      .getByText("Standalone answer")
      .closest("[data-session-observation-depth]");
    expect(
      leafObservation?.querySelector(
        '[data-session-observation-rail-depth="0"]',
      ),
    ).toBeInTheDocument();
    expect(
      leafObservation?.querySelector("[data-session-observation-rail-end]"),
    ).toBeInTheDocument();
    expect(screen.queryByText("generation-1")).not.toBeInTheDocument();
    expect(screen.queryByText("tool-1")).not.toBeInTheDocument();

    const rootToggle = screen.getByRole("button", {
      name: "Show 2 generations and 5 tools",
    });
    const rootStart = rootToggle.closest("[data-session-observation-depth]");
    expect(
      rootStart?.querySelector('[data-session-observation-rail-depth="0"]'),
    ).toHaveClass("top-[22px]");
    const closingRailEnd = screen
      .getByText("Finished the dashboard")
      .closest("[data-session-observation-depth]")
      ?.querySelector("[data-session-observation-rail-end]");
    expect(closingRailEnd).toBeInTheDocument();
    expect(closingRailEnd).toHaveClass("rounded-full");
    expect(rootToggle.querySelector(".lucide-chevrons-up-down")).toBeTruthy();

    fireEvent.click(rootToggle);

    expect(screen.getByText("generation-1")).toBeInTheDocument();
    expect(screen.getByText("generation-2")).toBeInTheDocument();
    expect(screen.getByText("tool-1")).toBeInTheDocument();
    expect(rootToggle.parentElement).toHaveClass("h-0");
    expect(rootToggle.querySelector(".lucide-chevrons-down-up")).toBeTruthy();
    const nestedGeneration = container
      .querySelector('[data-session-observation-id="generation-1"]')
      ?.closest("[data-session-observation-depth]");
    const nestedTool = container
      .querySelector('[data-session-observation-id="tool-1"]')
      ?.closest("[data-session-observation-depth]");
    expect(nestedGeneration).toHaveAttribute(
      "data-session-observation-depth",
      "1",
    );
    expect(nestedGeneration).toHaveStyle({ paddingLeft: "24px" });
    expect(
      nestedGeneration?.querySelectorAll(
        "[data-session-observation-rail-depth]",
      ),
    ).toHaveLength(2);
    expect(nestedTool).toHaveAttribute("data-session-observation-depth", "2");
    expect(nestedTool).toHaveStyle({ paddingLeft: "48px" });
    expect(
      nestedTool?.querySelectorAll("[data-session-observation-rail-depth]"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Hide 3 tools" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide 3 tools" })).toHaveStyle({
      left: "7.5px",
    });
    expect(screen.getByRole("button", { name: "Hide 3 tools" })).toHaveClass(
      "top-[16px]",
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide 3 tools" }));
    expect(screen.queryByText("tool-1")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show 3 tools" }),
    ).toBeInTheDocument();
  });
});
