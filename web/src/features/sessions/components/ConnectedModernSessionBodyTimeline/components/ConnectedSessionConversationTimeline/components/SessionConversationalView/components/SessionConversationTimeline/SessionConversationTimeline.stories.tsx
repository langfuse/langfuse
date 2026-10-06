import preview from "@/.storybook/preview";
import { expect, fn, waitFor } from "storybook/test";
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";

function SessionConversationTimelineStory({
  onLoadMoreObservations,
}: {
  onLoadMoreObservations: () => void;
}) {
  const traces = Array.from({ length: 3 }, (_, index) => ({
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
    state: { type: "loading" as const },
    onOpenTrace: fn(),
    onOpenObservation: fn(),
    scrollTarget: null,
  }));
  const controller = useSessionConversationTimelineController(traces);
  return (
    <div className="h-[200px]">
      <SessionConversationTimeline
        traces={traces}
        filterMeasurementKey="storybook"
        controller={controller}
        onLoadMoreObservations={onLoadMoreObservations}
      />
    </div>
  );
}

const meta = preview.meta({ component: SessionConversationTimelineStory });
export default meta;

export const LoadMoreObservations = meta.story({
  name: "(Test) Loads More Observations",
  args: { onLoadMoreObservations: fn() },
  play: async ({ args, canvas }) => {
    const timeline = canvas.getByLabelText("Session conversation timeline");
    await canvas.findByRole("button", { name: /Turn 1.*trace-1/ });
    await waitFor(() => {
      expect(timeline.scrollHeight).toBeGreaterThan(timeline.clientHeight);
    });
    timeline.scrollTop = 0;
    timeline.dispatchEvent(new Event("scroll", { bubbles: true }));
    await expect(args.onLoadMoreObservations).not.toHaveBeenCalled();
    timeline.scrollTop = timeline.scrollHeight;
    timeline.dispatchEvent(new Event("scroll", { bubbles: true }));
    await waitFor(() => {
      expect(args.onLoadMoreObservations).toHaveBeenCalled();
    });
  },
});
