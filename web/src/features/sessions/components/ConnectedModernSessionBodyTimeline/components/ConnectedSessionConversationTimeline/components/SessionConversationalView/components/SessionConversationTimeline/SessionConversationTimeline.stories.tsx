import preview from "@/.storybook/preview";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";

function SessionConversationTimelineStory({
  dynamicContent,
}: {
  dynamicContent: boolean;
}) {
  const traces = Array.from(
    { length: dynamicContent ? 40 : 3 },
    (_, index) => ({
      trace: {
        id: `trace-${index + 1}`,
        name: `Turn ${index + 1}`,
        timestamp: new Date("2026-09-24T12:00:00Z"),
        environment: "default",
        userId: null,
        observationCount: 0,
        latencyMs: null,
        scores: [],
      },
      turnNumber: index + 1,
      state: dynamicContent
        ? {
            type: "transcript" as const,
            result: {
              state: "loaded" as const,
              cutoff: false,
              transcript: {
                threads: [
                  {
                    conversationHistory: [],
                    currentTurn: {
                      nestingLevel: 0,
                      observations: [
                        {
                          id: `observation-${index}`,
                          traceId: `trace-${index + 1}`,
                        },
                      ],
                      messages: [
                        {
                          role: "assistant" as const,
                          source: "output" as const,
                          observationId: `observation-${index}`,
                          traceId: `trace-${index + 1}`,
                          startTime: new Date("2026-09-24T12:00:00Z"),
                          endTime: null,
                          parts: [
                            {
                              type: "text" as const,
                              text: "A dynamic message whose height changes when expanded or resized. ".repeat(
                                80 + index * 2,
                              ),
                            },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            },
          }
        : { type: "loading" as const },
      onOpenTrace: fn(),
      onOpenObservation: fn(),
      scrollTarget: null,
    }),
  );
  const controller = useSessionConversationTimelineController(traces);
  return (
    <div className="h-[200px]">
      <SessionConversationTimeline traces={traces} controller={controller} />
    </div>
  );
}

const meta = preview.meta({
  component: SessionConversationTimelineStory,
  args: { dynamicContent: false },
});
export default meta;

export const ScrollableTimeline = meta.story({
  name: "(Test) Scrollable Timeline",
  play: async ({ canvas }) => {
    const timeline = canvas.getByLabelText("Session conversation timeline");
    await canvas.findByRole("button", { name: /Turn 1.*trace-1/ });
    await waitFor(() => {
      expect(timeline.scrollHeight).toBeGreaterThan(timeline.clientHeight);
    });
    timeline.scrollTop = timeline.scrollHeight;
    timeline.dispatchEvent(new Event("scroll", { bubbles: true }));
    await waitFor(() => {
      expect(timeline.scrollTop).toBeGreaterThan(0);
    });
  },
});

export const DynamicRowMeasurement = meta.story({
  name: "(Test) Keeps Dynamic Rows Contiguous",
  args: { dynamicContent: true },
  play: async ({ canvas, canvasElement }) => {
    const timeline = canvas.getByLabelText("Session conversation timeline");
    const expectContiguousRows = async () => {
      await waitFor(() => {
        const rows = Array.from(
          timeline.querySelectorAll<HTMLElement>(
            "[data-session-virtualizer-row]",
          ),
        )
          .map((row) => row.getBoundingClientRect())
          .sort((left, right) => left.top - right.top);
        expect(rows.length).toBeGreaterThan(1);
        const viewport = timeline.getBoundingClientRect();
        expect(rows[0]!.top).toBeLessThanOrEqual(viewport.top + 1);
        expect(rows.at(-1)!.bottom).toBeGreaterThanOrEqual(viewport.bottom - 1);
        for (let index = 1; index < rows.length; index++) {
          expect(
            Math.abs(rows[index]!.top - rows[index - 1]!.bottom),
          ).toBeLessThan(2);
        }
      });
    };
    await canvas.findAllByRole("button", { name: "Show more" });
    await expectContiguousRows();
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Show more" })[0]!,
    );
    await expectContiguousRows();
    await userEvent.click(canvas.getByRole("button", { name: "Show less" }));
    await expectContiguousRows();
    for (const offset of [1500, 4500, 9000, 2000, 0]) {
      timeline.scrollTop = offset;
      timeline.dispatchEvent(new Event("scroll", { bubbles: true }));
      await expectContiguousRows();
    }
    const originalWidth = canvasElement.style.width;
    try {
      canvasElement.style.width = "320px";
      await expectContiguousRows();
    } finally {
      canvasElement.style.width = originalWidth;
    }
  },
});
