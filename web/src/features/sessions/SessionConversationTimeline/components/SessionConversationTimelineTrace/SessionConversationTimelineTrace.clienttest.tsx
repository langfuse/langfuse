import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionConversationTimelineTrace } from "./SessionConversationTimelineTrace";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

vi.mock("@/src/components/ui/PrettyJsonView", () => ({
  PrettyJsonView: ({ json }: { json: unknown }) => (
    <pre>{JSON.stringify(json)}</pre>
  ),
}));
vi.mock("@/src/components/ui/MarkdownViewer", () => ({
  MarkdownView: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}));

type Props = ComponentProps<typeof SessionConversationTimelineTrace>;
const trace: Props["trace"] = {
  id: "trace-1",
  name: "Trace",
  timestamp: new Date(0),
  environment: "production",
  userId: null,
  observationCount: 4,
  latencyMs: 1000,
  scores: [],
};
const timing = {
  observationId: "generation-1",
  traceId: trace.id,
  startTime: new Date("2026-09-24T12:00:00Z"),
  endTime: new Date("2026-09-24T12:00:01Z"),
};

describe("SessionConversationTimelineTrace", () => {
  it("keeps trace and observation navigation without source actions", () => {
    const onOpenTrace = vi.fn();
    const onOpenObservation = vi.fn();
    const sourceObservation = {
      id: timing.observationId,
      traceId: trace.id,
      name: "Source generation",
      startTime: timing.startTime,
      environment: trace.environment,
    } as Extract<
      Props["state"],
      { type: "transcript" }
    >["observations"][number];
    render(
      <SessionConversationTimelineTrace
        trace={trace}
        turnNumber={1}
        onOpenTrace={onOpenTrace}
        onOpenObservation={onOpenObservation}
        scrollTarget={null}
        state={{
          type: "transcript",
          observations: [sourceObservation],
          result: {
            state: "loaded",
            cutoff: false,
            transcript: {
              threads: [
                {
                  conversationHistory: [],
                  currentTurn: {
                    nestingLevel: 0,
                    observations: [],
                    messages: [
                      {
                        ...timing,
                        role: "system",
                        source: "input",
                        parts: [{ type: "text", text: "System instructions" }],
                      },
                      {
                        ...timing,
                        role: "assistant",
                        source: "output",
                        parts: [{ type: "text", text: "Answer" }],
                      },
                    ],
                  },
                },
              ],
            },
          },
        }}
      />,
      { wrapper: LayerProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: /trace · trace-1/ }));
    const systemHeader = screen.getByRole("button", {
      name: "System prompt",
    }).parentElement!;
    const systemTimestamp = systemHeader.querySelector("time");
    expect(systemTimestamp?.dateTime).toBe(timing.startTime.toISOString());
    expect(
      systemTimestamp?.parentElement?.classList.contains("invisible"),
    ).toBe(true);
    const systemObservationButton =
      systemHeader.querySelector("button.underline")!;
    expect(
      systemObservationButton.parentElement?.classList.contains("invisible"),
    ).toBe(true);
    fireEvent.click(systemObservationButton);
    expect(onOpenTrace).toHaveBeenCalledOnce();
    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(onOpenObservation).toHaveBeenCalledWith("generation-1");
    expect(screen.queryByRole("button", { name: /^Actions/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Transcript may be incomplete" }),
    ).toBeNull();
  });

  it("hides history, preserves multiple threads, renders tool payloads and source timing, and blocks replay capture", async () => {
    const onOpenObservation = vi.fn();
    const { container } = render(
      <SessionConversationTimelineTrace
        trace={trace}
        turnNumber={1}
        onOpenTrace={vi.fn()}
        onOpenObservation={onOpenObservation}
        scrollTarget={null}
        state={{
          type: "transcript",
          observations: [{ id: "generation-1" }] as Extract<
            Props["state"],
            { type: "transcript" }
          >["observations"],
          result: {
            state: "loaded",
            cutoff: true,
            transcript: {
              threads: [
                {
                  conversationHistory: [
                    {
                      role: "user",
                      source: "input",
                      parts: [{ type: "text", text: "Earlier question" }],
                    },
                  ],
                  currentTurn: {
                    nestingLevel: 0,
                    observations: [],
                    messages: [
                      {
                        ...timing,
                        role: "assistant",
                        source: "output",
                        parts: [
                          { type: "text", text: "Checking weather" },
                          {
                            type: "tool-call",
                            toolCallId: "call-1",
                            toolName: "weather",
                            input: { city: "Berlin" },
                          },
                        ],
                      },
                      {
                        ...timing,
                        endTime: null,
                        role: "tool",
                        source: "output",
                        parts: [
                          {
                            type: "tool-result",
                            toolCallId: "call-1",
                            toolName: "weather",
                            output: { temperature: 12 },
                            isError: true,
                          },
                        ],
                      },
                    ],
                  },
                },
                {
                  conversationHistory: [],
                  currentTurn: {
                    nestingLevel: 0,
                    observations: [],
                    messages: [
                      {
                        ...timing,
                        role: "assistant",
                        source: "output",
                        endTime: null,
                        parts: [{ type: "text", text: "Other thread" }],
                      },
                    ],
                  },
                },
              ],
            },
          },
        }}
      />,
      { wrapper: LayerProvider },
    );

    const text = container.textContent!;
    expect(text).not.toContain("Earlier question");
    expect(text.indexOf("Checking weather")).toBeLessThan(
      text.indexOf("Other thread"),
    );
    fireEvent.click(screen.getByRole("button", { name: "weather" }));
    expect(onOpenObservation).toHaveBeenCalledWith("generation-1");
    expect(screen.queryByText("Input")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand weather" }));
    expect(screen.queryByText("weather · Result")).toBeNull();
    expect(screen.getByText("Input")).toBeTruthy();
    expect(screen.getByText("Output")).toBeTruthy();
    expect(screen.getByText(/"city": "Berlin"/)).toBeTruthy();
    expect(screen.getByText(/"temperature": 12/)).toBeTruthy();
    expect(screen.getByLabelText("Failed")).toBeTruthy();
    const toolRow = screen
      .getByRole("button", { name: "Collapse weather" })
      .closest("section")!;
    onOpenObservation.mockClear();
    fireEvent.click(
      within(toolRow).getByRole("button", { name: "Open observation" }),
    );
    expect(onOpenObservation).toHaveBeenCalledExactlyOnceWith("generation-1");
    expect(screen.queryByRole("button", { name: /^Actions/ })).toBeNull();
    expect(
      container.querySelectorAll('time[datetime="2026-09-24T12:00:00.000Z"]'),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll('time[datetime="2026-09-24T12:00:01.000Z"]'),
    ).toHaveLength(0);
    expect(screen.getByText("1.00s")).toBeTruthy();
    expect(
      Array.from(
        container.querySelectorAll("[data-session-transcript-row-id]"),
      ).map((row) => row.getAttribute("data-session-transcript-row-id")),
    ).toEqual(["0:0", "0:1", "1:0"]);
    expect(screen.queryByRole("status")).toBeNull();
    const cutoffWarning = screen.getByRole("button", {
      name: "Transcript may be incomplete",
    });
    expect(cutoffWarning.parentElement).toBe(
      screen.getByRole("button", { name: /trace · trace-1/ }).parentElement,
    );
    expect(text).not.toContain(
      "This transcript may be incomplete because the observation limit was reached.",
    );
    fireEvent.mouseEnter(cutoffWarning);
    expect(
      (await screen.findByRole("tooltip", {}, { timeout: 2000 })).textContent,
    ).toContain(
      "This transcript may be incomplete because the observation limit was reached.",
    );
    expect(
      screen
        .getByText(/"temperature": 12/)
        .closest(".ph-no-capture")
        ?.classList.contains("ph-no-capture"),
    ).toBe(true);
  });
});
