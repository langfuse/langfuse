import preview from "@/.storybook/preview";
import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";

function SessionConversationTimelineStory({
  dynamicContent,
  navigation,
}: {
  dynamicContent: boolean;
} & Pick<ComponentProps<typeof SessionConversationTimeline>, "navigation">) {
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
                              text: `Turn ${index + 1} message. ${"A dynamic message whose height changes when expanded or resized. ".repeat(
                                80 + index * 2,
                              )}`,
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
      <SessionConversationTimeline
        traces={traces}
        controller={controller}
        navigation={navigation}
      />
    </div>
  );
}

const meta = preview.meta({
  component: SessionConversationTimelineStory,
  args: { dynamicContent: false },
});
export default meta;

function SingleTraceLoadingStory() {
  const [isLoading, setIsLoading] = useState(true);
  const traces: ComponentProps<typeof SessionConversationTimeline>["traces"] = [
    {
      trace: { id: "trace-1", name: "Loading trace" },
      turnNumber: 1,
      variant: "single-trace",
      state: isLoading ? { type: "loading" } : { type: "empty" },
      onOpenTrace: fn(),
      onOpenObservation: fn(),
      scrollTarget: null,
    },
  ];
  const controller = useSessionConversationTimelineController(traces);
  return (
    <div>
      <button onClick={() => setIsLoading(false)}>Finish loading</button>
      <div className="h-[600px]">
        <SessionConversationTimeline
          traces={traces}
          controller={controller}
          navigation={{
            previousTrace: { href: "#previous", count: 3 },
            nextTrace: { href: "#next", count: 1 },
          }}
        />
      </div>
    </div>
  );
}

export const StableSingleTraceLoading = meta.story({
  name: "(Test) Single Trace Navigation Remains Available After Loading",
  render: () => <SingleTraceLoadingStory />,
  play: async ({ canvas }) => {
    const previous = canvas.getByRole("link", {
      name: "Previous trace in session (3)",
    });
    const next = canvas.getByRole("link", {
      name: "Next trace in session (1)",
    });
    expect(
      canvas.getByRole("status", { name: "Loading messages" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Finish loading" }),
    );
    expect(
      canvas.queryByRole("status", { name: "Loading messages" }),
    ).not.toBeInTheDocument();
    expect(previous).toBeVisible();
    expect(next).toBeVisible();
  },
});

export const TimelineNavigation = meta.story({
  name: "(Test) Navigation Before And After Messages",
  args: {
    navigation: {
      previousTrace: {
        count: 3,
        href: "/project/project-1/traces?peek=previous-trace&traceView=messages",
        shallow: true,
      },
      nextTrace: {
        count: 1,
        href: "/project/project-1/traces?peek=next-trace&traceView=messages",
        shallow: true,
      },
    },
  },
  play: async ({ canvas, args }) => {
    const timeline = canvas.getByLabelText("Session conversation timeline");
    const previous = await canvas.findByRole("link", {
      name: "Previous trace in session (3)",
    });
    await expect(previous).toBeVisible();
    expect(previous).toHaveAttribute(
      "href",
      args.navigation?.previousTrace?.href,
    );
    const firstHeader = canvas.getByRole("button", { name: "Turn 1" });
    expect(previous.compareDocumentPosition(firstHeader)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    timeline.scrollTop = timeline.scrollHeight;
    timeline.dispatchEvent(new Event("scroll", { bubbles: true }));
    const next = await canvas.findByRole("link", {
      name: "Next trace in session (1)",
    });
    await expect(next).toBeVisible();
    expect(next).toHaveAttribute("href", args.navigation?.nextTrace?.href);
    const lastHeader = canvas.getByRole("button", { name: "Turn 3" });
    expect(lastHeader.compareDocumentPosition(next)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  },
});

export const ScrollableTimeline = meta.story({
  name: "(Test) Scrollable Timeline",
  play: async ({ canvas }) => {
    const timeline = canvas.getByLabelText("Session conversation timeline");
    await canvas.findAllByRole("status", { name: "Loading messages" });
    await waitFor(() => {
      expect(timeline.scrollHeight).toBeGreaterThan(timeline.clientHeight);
    });
    timeline.scrollTop = timeline.scrollHeight;
    timeline.dispatchEvent(new Event("scroll", { bubbles: true }));
    await waitFor(() => {
      expect(timeline.scrollTop).toBeGreaterThan(0);
      const lastTrace = canvas
        .getAllByRole("status", { name: "Loading messages" })
        .at(-1)!
        .getBoundingClientRect();
      const viewport = timeline.getBoundingClientRect();
      expect(lastTrace.bottom).toBeGreaterThan(viewport.top);
      expect(lastTrace.top).toBeLessThan(viewport.bottom);
    });
  },
});

export const DynamicRowMeasurement = meta.story({
  name: "(Test) Scrolls After Expanding And Resizing Messages",
  args: { dynamicContent: true },
  play: async ({ canvas, canvasElement }) => {
    const timeline = canvas.getByLabelText("Session conversation timeline");
    await canvas.findAllByRole("button", { name: "Show more" });
    const expectContiguousRows = async () => {
      await waitFor(() => {
        const rows = Array.from(
          timeline.querySelectorAll<HTMLElement>(
            "[data-session-virtualizer-row]",
          ),
        );
        expect(rows.length).toBeGreaterThan(1);
        for (let index = 1; index < rows.length; index++) {
          expect(rows[index]!.getBoundingClientRect().top).toBeCloseTo(
            rows[index - 1]!.getBoundingClientRect().bottom,
            0,
          );
        }
      });
    };
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Show more" })[0]!,
    );
    await expect(
      canvas.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expectContiguousRows();
    await userEvent.click(canvas.getByRole("button", { name: "Show less" }));
    await expectContiguousRows();
    const originalWidth = canvasElement.style.width;
    try {
      for (const width of ["320px", originalWidth]) {
        canvasElement.style.width = width;
        for (const turn of [40, 1]) {
          await waitFor(() => {
            timeline.scrollTop = turn === 40 ? timeline.scrollHeight : 0;
            timeline.dispatchEvent(new Event("scroll", { bubbles: true }));
            const header = canvas
              .getByText((text) => text.startsWith(`Turn ${turn} message.`))
              .getBoundingClientRect();
            const viewport = timeline.getBoundingClientRect();
            expect(header.bottom).toBeGreaterThan(viewport.top);
            expect(header.top).toBeLessThan(viewport.bottom);
          });
          await expectContiguousRows();
        }
      }
    } finally {
      canvasElement.style.width = originalWidth;
    }
  },
});
