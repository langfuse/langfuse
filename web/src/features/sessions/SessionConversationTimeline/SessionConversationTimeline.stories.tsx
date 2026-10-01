import preview from "@/.storybook/preview";
import { type ComponentProps } from "react";
import { expect, fn, within } from "storybook/test";
import { SessionConversationTimeline } from "./SessionConversationTimeline";
import { useSessionConversationTimelineController } from "./useSessionConversationTimelineController";
import { SessionConversationTimelineTrace } from "./components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";

type TraceProps = ComponentProps<typeof SessionConversationTimelineTrace>;

const traces: TraceProps[] = [
  {
    trace: {
      id: "trace-1",
      name: "First turn",
      timestamp: new Date("2026-09-24T12:00:00Z"),
      environment: "default",
      userId: null,
      observationCount: 0,
      latencyMs: 1000,
      scores: [],
    },
    turnNumber: 1,
    state: {
      type: "transcript",
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
                    observationId: "generation-1",
                    traceId: "trace-1",
                    startTime: new Date("2026-09-24T12:00:00Z"),
                    endTime: null,
                    role: "user",
                    source: "input",
                    parts: [{ type: "text", text: "Can you check my order?" }],
                  },
                  {
                    observationId: "generation-1",
                    traceId: "trace-1",
                    startTime: new Date("2026-09-24T12:00:00Z"),
                    endTime: null,
                    role: "assistant",
                    source: "output",
                    parts: [{ type: "text", text: "I'll look it up." }],
                  },
                ],
              },
            },
          ],
        },
      },
      observations: [{ id: "generation-1" }] as Extract<
        TraceProps["state"],
        { type: "transcript" }
      >["observations"],
      filtered: false,
    },
    onOpenTrace: () => {},
    onOpenObservation: () => {},
    scrollTarget: null,
  },
  {
    trace: {
      id: "trace-2",
      name: "Next turn",
      timestamp: new Date("2026-09-24T12:01:00Z"),
      environment: "default",
      userId: null,
      observationCount: 1,
      latencyMs: null,
      scores: [],
    },
    turnNumber: 2,
    state: { type: "loading" },
    onOpenTrace: () => {},
    onOpenObservation: () => {},
    scrollTarget: null,
  },
];

function SessionConversationTimelineStory({
  onLoadMoreObservations,
}: {
  onLoadMoreObservations?: () => void;
}) {
  const controller = useSessionConversationTimelineController(traces);
  return (
    <div className="h-[500px]">
      <SessionConversationTimeline
        traces={traces}
        TraceComponent={SessionConversationTimelineTrace}
        filterMeasurementKey="storybook"
        controller={controller}
        onLoadMoreObservations={onLoadMoreObservations}
      />
    </div>
  );
}

const meta = preview.meta({ component: SessionConversationTimelineStory });
export default meta;
export const MultipleTraces = meta.story({
  name: "(Test) Renders Multiple Traces",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Can you check my order?"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("I'll look it up.")).toBeInTheDocument();
  },
});
export const LoadMoreObservations = meta.story({
  name: "(Test) Loads More Observations",
  args: { onLoadMoreObservations: fn() },
  play: async ({ args, canvasElement }) => {
    const timeline = within(canvasElement).getByLabelText(
      "Session conversation timeline",
    );
    timeline.scrollTop = timeline.scrollHeight;
    timeline.dispatchEvent(new Event("scroll", { bubbles: true }));
    await expect(args.onLoadMoreObservations).toHaveBeenCalledOnce();
  },
});
