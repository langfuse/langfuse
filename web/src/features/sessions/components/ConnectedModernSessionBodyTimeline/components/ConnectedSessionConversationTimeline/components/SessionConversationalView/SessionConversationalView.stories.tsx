import preview from "@/.storybook/preview";
import { type ComponentProps, useRef, useState } from "react";
import { expect, fn, userEvent, within, waitFor } from "storybook/test";
import { SessionConversationalView } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/SessionConversationalView";
import {
  useSessionConversationTimelineController,
  type SessionConversationTimelineScrollTarget,
} from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { type SessionConversationTimelineTrace } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import {
  supportAgentWorkflow,
  codingAgentWorkflow,
  langfuseAssistantWorkflow,
} from "@/src/features/sessions/constants/workflowStoryFixtures";

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
      observations: [
        {
          id: "generation-1",
          traceId: "trace-1",
          name: "Order assistant",
          startTime: new Date("2026-09-24T12:00:00Z"),
          environment: "default",
        },
      ] as Extract<TraceProps["state"], { type: "transcript" }>["observations"],
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

function SessionConversationalViewStory({
  workflowTraces,
  isLoading = false,
  isSearchPending = false,
  groupedTools = false,
  searchQueryOverride,
}: {
  workflowTraces?: typeof supportAgentWorkflow;
  isLoading?: boolean;
  isSearchPending?: boolean;
  groupedTools?: boolean;
  searchQueryOverride?: string;
}) {
  const [search, setSearch] = useState("");
  const [collapsedTraceIds, setCollapsedTraceIds] = useState<Set<string>>(
    new Set(),
  );
  const [scrollTarget, setScrollTarget] =
    useState<SessionConversationTimelineScrollTarget | null>(null);
  const requestId = useRef(0);
  const toolTraces: TraceProps[] = [
    {
      ...traces[0]!,
      state: {
        type: "transcript",
        observations: Array.from({ length: 3 }, (_, batchIndex) => ({
          id: `batch-${batchIndex}`,
          traceId: traces[0]!.trace.id,
          name: `Tool batch ${batchIndex + 1}`,
          startTime: traces[0]!.trace.timestamp,
          environment: traces[0]!.trace.environment,
        })) as Extract<
          TraceProps["state"],
          { type: "transcript" }
        >["observations"],
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
                    Array.from({ length: 5 }, () => "tool_1"),
                    ["tool_a", "tool_b"],
                    Array.from(
                      { length: 7 },
                      (_, index) => `very_long_tool_name_${index}`,
                    ),
                  ].flatMap((names, batchIndex) => {
                    const provenance = {
                      observationId: `batch-${batchIndex}`,
                      traceId: traces[0]!.trace.id,
                      startTime: traces[0]!.trace.timestamp,
                      endTime: null,
                      role: "assistant" as const,
                      source: "output" as const,
                    };
                    return [
                      {
                        ...provenance,
                        parts: [
                          {
                            type: "text" as const,
                            text: `Tool batch ${batchIndex + 1}`,
                          },
                        ],
                      },
                      {
                        ...provenance,
                        parts: names.map((toolName, toolIndex) => ({
                          type: "tool-call" as const,
                          toolName,
                          toolCallId: `${batchIndex}-${toolIndex}`,
                          input: { toolIndex },
                        })),
                      },
                    ];
                  }),
                },
              },
            ],
          },
        },
      },
    },
  ];
  const workflowTraceProps = workflowTraces
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
  const displayedTraces = groupedTools ? toolTraces : workflowTraceProps;
  const controller = useSessionConversationTimelineController(displayedTraces);
  if (isLoading) {
    return (
      <div className="@container/session-workspace flex h-screen min-w-[320px]">
        <SessionConversationalView
          state="loading"
          traces={displayedTraces.map((item) => ({
            ...item,
            state: { type: "loading" },
          }))}
          controller={controller}
        />
      </div>
    );
  }
  return (
    <div className="@container/session-workspace flex h-screen min-w-[320px]">
      <SessionConversationalView
        state="loaded"
        search={search}
        searchQuery={searchQueryOverride ?? search.trim()}
        isSearchPending={
          isSearchPending ||
          (searchQueryOverride !== undefined &&
            search.trim() !== searchQueryOverride)
        }
        onSearchChange={setSearch}
        expandedTraceIds={
          new Set(
            displayedTraces
              .filter((item) => !collapsedTraceIds.has(item.trace.id))
              .map((item) => item.trace.id),
          )
        }
        onToggleTraceExpanded={(traceId) =>
          setCollapsedTraceIds((current) => {
            const next = new Set(current);
            if (next.has(traceId)) next.delete(traceId);
            else next.add(traceId);
            return next;
          })
        }
        onSelect={(index, observationId, rowId) => {
          const traceId = displayedTraces[index]?.trace.id;
          if (traceId && observationId) {
            setScrollTarget({
              traceId,
              observationId,
              rowId,
              requestId: ++requestId.current,
            });
          }
          controller.onSelect(index, observationId, rowId);
        }}
        onVisibleTraceIdsChange={fn()}
        isLoadingTranscripts={isSearchPending}
        transcriptLoadError={false}
        traces={displayedTraces.map((item) => ({
          ...item,
          scrollTarget,
        }))}
        controller={controller}
      />
    </div>
  );
}

const meta = preview.meta({ component: SessionConversationalViewStory });
export default meta;
export const Loading = meta.story({
  name: "(Test) Loading",
  args: { isLoading: true },
  play: async ({ canvasElement }) => {
    const sidebar = within(canvasElement).getByRole("complementary");
    await expect(sidebar).toHaveAttribute("aria-busy", "true");
    await expect(
      within(sidebar).getByRole("textbox", {
        name: "Search messages and tools",
      }),
    ).toBeDisabled();
  },
});
export const SupportAgentWorkflow = meta.story({
  name: "(Test) Support Agent Workflow",
  args: { workflowTraces: supportAgentWorkflow },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    for (const name of [
      "System message",
      "User message",
      "Assistant message",
    ]) {
      await expect(
        (await sidebar.findAllByRole("button", { name })).length,
      ).toBeGreaterThan(0);
    }
    await expect(
      await sidebar.findByRole("button", { name: "tool: Get order" }),
    ).toBeInTheDocument();
    await expect(
      sidebar.getByRole("textbox", { name: "Search messages and tools" }),
    ).toBeEnabled();
    await expect(
      await within(
        canvas.getByLabelText("Session conversation timeline"),
      ).findByText(/Hi, I just noticed order #LF-20481/),
    ).toBeInTheDocument();
    await expect(
      await within(
        canvas.getByLabelText("Session conversation timeline"),
      ).findByText(/Your shipping address has been updated/),
    ).toBeInTheDocument();
    const timeline = within(
      canvas.getByLabelText("Session conversation timeline"),
    );
    for (const button of timeline.queryAllByRole("button", {
      name: /^Show tools:/,
    })) {
      await userEvent.click(button);
    }
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
export const ConsecutiveToolGroups = meta.story({
  name: "(Test) Groups Consecutive Tools",
  args: { groupedTools: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    const timeline = within(
      canvas.getByLabelText("Session conversation timeline"),
    );
    for (const summary of ["5 tool calls", "2 tool calls", "7 tool calls"]) {
      await expect(sidebar.getByText(summary)).toBeInTheDocument();
      await expect(
        timeline.getByRole("button", { name: `Show tools: ${summary}` }),
      ).toHaveAttribute("aria-expanded", "false");
    }
    await userEvent.click(sidebar.getByText("2 tool calls"));
    await expect(
      timeline.getByRole("button", { name: "Hide tools: 2 tool calls" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      timeline.getByRole("button", { name: "Expand tool_b" }),
    ).toBeInTheDocument();
    await userEvent.click(
      timeline.getByRole("button", { name: "Hide tools: 2 tool calls" }),
    );
    await expect(
      timeline.getByRole("button", { name: "Show tools: 2 tool calls" }),
    ).toHaveAttribute("aria-expanded", "false");
    await userEvent.type(sidebar.getByRole("textbox"), "tool_1");
    await expect(
      sidebar.getAllByRole("button", { name: "tool: tool_1" }),
    ).toHaveLength(5);
    await expect(sidebar.queryByText("2 tool calls")).not.toBeInTheDocument();
    await expect(
      timeline.getByRole("button", { name: "Show tools: 7 tool calls" }),
    ).toBeInTheDocument();
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
    const sidebar = within(within(canvasElement).getByRole("complementary"));
    await expect(
      await sidebar.findByRole("button", { name: "User message" }),
    ).toBeInTheDocument();
    await expect(
      await sidebar.findByRole("button", { name: "Assistant message" }),
    ).toBeInTheDocument();
    await expect(
      await sidebar.findByRole("button", { name: "1 First turn" }),
    ).toBeInTheDocument();
    await expect(
      await sidebar.findByRole("button", { name: "2 Next turn" }),
    ).toBeInTheDocument();
    const canvas = within(
      within(canvasElement).getByLabelText("Session conversation timeline"),
    );
    await expect(
      await canvas.findByText("Can you check my order?"),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByText("I'll look it up."),
    ).toBeInTheDocument();
  },
});
export const SearchMatchingMessages = meta.story({
  name: "(Test) Filters Only Sidebar Messages",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    await sidebar.findByRole("button", { name: "User message" });
    const timeline = canvas.getByLabelText("Session conversation timeline");
    await within(timeline).findByText("I'll look it up.");
    await userEvent.type(sidebar.getByRole("textbox"), "ORDER");
    await expect(
      sidebar.getByRole("button", { name: "User message" }),
    ).toBeInTheDocument();
    await expect(
      sidebar.queryByRole("button", { name: "Assistant message" }),
    ).not.toBeInTheDocument();
    await expect(
      sidebar.getByRole("button", { name: "1 First turn" }),
    ).toBeInTheDocument();
    await expect(
      within(canvas.getByLabelText("Session conversation timeline")).getByText(
        "I'll look it up.",
      ),
    ).toBeInTheDocument();
    await waitFor(async () => {
      await expect(
        Array.from(CSS.highlights.values())
          .flatMap((highlight) => Array.from(highlight))
          .filter((range) => timeline.contains(range.startContainer))
          .map((range) => range.toString()),
      ).toContain("order");
    });
    await userEvent.clear(sidebar.getByRole("textbox"));
    await waitFor(async () => {
      await expect(
        Array.from(CSS.highlights.values())
          .flatMap((highlight) => Array.from(highlight))
          .filter((range) => timeline.contains(range.startContainer)),
      ).toHaveLength(0);
    });
    await userEvent.type(sidebar.getByRole("textbox"), "no-such-message");
    await expect(
      await sidebar.findByText("No matching turns"),
    ).toBeInTheDocument();
    await expect(
      within(timeline).getByText("I'll look it up."),
    ).toBeInTheDocument();
    await userEvent.clear(sidebar.getByRole("textbox"));
    await expect(
      await sidebar.findByRole("button", { name: "User message" }),
    ).toBeInTheDocument();
    await expect(
      await sidebar.findByRole("button", { name: "Assistant message" }),
    ).toBeInTheDocument();
    await expect(
      sidebar.queryByText("No matching turns"),
    ).not.toBeInTheDocument();
  },
});
export const ClearPendingSearch = meta.story({
  name: "(Test) Clears Highlights While Search Is Pending",
  args: { searchQueryOverride: "ORDER" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", {
      name: "Search messages and tools",
    });
    const timeline = canvas.getByLabelText("Session conversation timeline");
    await userEvent.type(input, "ORDER");
    await waitFor(async () => {
      await expect(
        Array.from(CSS.highlights.values())
          .flatMap((highlight) => Array.from(highlight))
          .filter((range) => timeline.contains(range.startContainer))
          .map((range) => range.toString()),
      ).toContain("order");
    });
    await userEvent.clear(input);
    await expect(
      canvas.getByText("Loading transcripts..."),
    ).toBeInTheDocument();
    await expect(
      Array.from(CSS.highlights.values())
        .flatMap((highlight) => Array.from(highlight))
        .filter((range) => timeline.contains(range.startContainer)),
    ).toHaveLength(0);
  },
});
export const PendingSearch = meta.story({
  name: "(Test) Clears Only Sidebar During Pending Search",
  args: { isSearchPending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    await expect(
      sidebar.getByText("Loading transcripts..."),
    ).toBeInTheDocument();
    await expect(
      sidebar.queryByRole("button", { name: "1 First turn" }),
    ).not.toBeInTheDocument();
    await expect(
      within(canvas.getByLabelText("Session conversation timeline")).getByText(
        "Can you check my order?",
      ),
    ).toBeInTheDocument();
  },
});
