import preview from "@/.storybook/preview";
import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { SessionConversationTimeline } from "./SessionConversationTimeline";
import { useSessionConversationTimelineController } from "./useSessionConversationTimelineController";
import { SessionConversationTimelineTrace } from "./components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import {
  supportAgentWorkflow,
  codingAgentWorkflow,
  langfuseAssistantWorkflow,
} from "./workflowStoryFixtures";

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
  workflowTraces,
}: {
  onLoadMoreObservations?: () => void;
  workflowTraces?: typeof supportAgentWorkflow;
}) {
  const displayedTraces = workflowTraces
    ? workflowTraces.map((item) => ({
        ...item,
        state: {
          ...item.state,
          observations: item.state.observations as Extract<
            TraceProps["state"],
            { type: "transcript" }
          >["observations"],
        },
        onOpenTrace: fn(),
        onOpenObservation: fn(),
        scrollTarget: null,
      }))
    : traces;
  const controller = useSessionConversationTimelineController(displayedTraces);
  return (
    <div
      className={
        workflowTraces
          ? "bg-card dark:bg-background h-screen min-w-[320px]"
          : "h-[500px]"
      }
    >
      <SessionConversationTimeline
        traces={displayedTraces}
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
export const SupportAgentWorkflow = meta.story({
  args: { workflowTraces: supportAgentWorkflow },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/Hi, I just noticed order #LF-20481/),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/Your shipping address has been updated/),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Get order" }),
    );
    await expect(canvas.getByText(/800 Pine Street/)).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Update shipping address" }),
    );
    await expect(canvas.getByText(/addr_7b19c2/)).toBeInTheDocument();
  },
});
export const CodingAgentWorkflow = meta.story({
  args: { workflowTraces: codingAgentWorkflow },
});
export const LangfuseAssistantWorkflow = meta.story({
  args: { workflowTraces: langfuseAssistantWorkflow },
});
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
