import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionTranscriptTrace } from "./SessionTranscriptTrace";

vi.mock("@/src/components/ui/PrettyJsonView", () => ({
  PrettyJsonView: ({ json }: { json: unknown }) => (
    <pre>{JSON.stringify(json)}</pre>
  ),
}));
vi.mock("@/src/components/ui/MarkdownViewer", () => ({
  MarkdownView: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}));

type Props = ComponentProps<typeof SessionTranscriptTrace>;
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

describe("SessionTranscriptTrace", () => {
  it("preserves history and multiple threads, renders tool payloads and source timing, and blocks replay capture", () => {
    const { container } = render(
      <SessionTranscriptTrace
        trace={trace}
        turnNumber={1}
        result={{
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
        }}
      />,
    );

    const text = container.textContent!;
    expect(text.indexOf("Earlier question")).toBeLessThan(
      text.indexOf("Checking weather"),
    );
    expect(text.indexOf("Checking weather")).toBeLessThan(
      text.indexOf("Other thread"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand weather" }));
    expect(screen.queryByText("weather · Result")).toBeNull();
    expect(screen.getByText("Input")).toBeTruthy();
    expect(screen.getByText("Output")).toBeTruthy();
    expect(screen.getByText(/"city": "Berlin"/)).toBeTruthy();
    expect(screen.getByText(/"temperature": 12/)).toBeTruthy();
    expect(screen.getByLabelText("Failed")).toBeTruthy();
    expect(
      container.querySelectorAll('time[datetime="2026-09-24T12:00:00.000Z"]'),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll('time[datetime="2026-09-24T12:00:01.000Z"]'),
    ).toHaveLength(2);
    expect(screen.getAllByText("1.00s")).toHaveLength(2);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(
      screen
        .getByText("Earlier question")
        .closest(".ph-no-capture")
        ?.classList.contains("ph-no-capture"),
    ).toBe(true);
    expect(
      screen
        .getByText(/"temperature": 12/)
        .closest(".ph-no-capture")
        ?.classList.contains("ph-no-capture"),
    ).toBe(true);
  });
});
