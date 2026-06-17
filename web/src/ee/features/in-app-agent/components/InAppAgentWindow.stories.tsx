import preview from "../../../../../.storybook/preview";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { fn } from "storybook/test";
import {
  InAppAgentResourceReferenceObservation,
  InAppAgentResourceReferenceScore,
  InAppAgentResourceReferenceTrace,
} from "./InAppAgentResourceReference";
import type { InAppAgentResourceReferenceRenderer } from "./InAppAgentMessage";
import {
  InAppAgentWindow,
  type InAppAgentWindowMessage,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";
import {
  InAppAgentWindowShell,
  useInAppAgentWindowShellPanelControl,
} from "./InAppAgentWindowShell";

function InAppAgentWindowStoryShell({
  children,
  isExpanded,
}: {
  children: (props: { isHeaderDragHandleEnabled: boolean }) => ReactNode;
  isExpanded: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingPanelHandle = useInAppAgentWindowShellPanelControl({});

  useEffect(() => {
    floatingPanelHandle.initializeGeometry();
  }, [floatingPanelHandle]);

  return (
    <InAppAgentWindowShell
      floatingPanelHandle={floatingPanelHandle}
      isExpanded={isExpanded}
      panelRef={panelRef}
      zIndex={1}
    >
      {children}
    </InAppAgentWindowShell>
  );
}

const traceResources = {
  "trace-checkout-p95": {
    environment: "production",
    name: "checkout-agent / EU p95 spike",
    observations: [
      { id: "obs-router" },
      { id: "obs-rerank-documents" },
      { id: "obs-final-answer" },
    ],
    sessionId: "sess-checkout-1842",
    timestamp: "2026-06-16T13:58:22.000Z",
    userId: "user-1842",
  },
  "trace-checkout-baseline": {
    environment: "production",
    name: "checkout-agent / baseline",
    observations: [{ id: "obs-router" }, { id: "obs-final-answer" }],
    sessionId: "sess-checkout-1190",
    timestamp: "2026-06-16T13:41:08.000Z",
    userId: "user-1190",
  },
  "trace-refund-slow": {
    environment: "production",
    name: "refund-agent / reranker timeout",
    observations: [{ id: "obs-rerank-documents" }, { id: "obs-final-answer" }],
    sessionId: "sess-refund-7301",
    timestamp: "2026-06-16T13:55:44.000Z",
    userId: "user-7301",
  },
  "trace-support-escalation": {
    environment: "production",
    name: "support-agent / escalation handoff",
    observations: [{ id: "obs-escalation-event" }],
    sessionId: "sess-support-5094",
    timestamp: "2026-06-16T13:52:17.000Z",
    userId: "user-5094",
  },
  "trace-demo": {
    environment: "production",
    name: "checkout-agent",
    observations: [{ id: "obs-demo" }],
    timestamp: "2026-06-16T14:00:00.000Z",
    userId: "user-42",
  },
} satisfies Record<
  string,
  {
    environment: string;
    name: string;
    observations: Array<{ id: string }>;
    sessionId?: string;
    timestamp: string;
    userId: string;
  }
>;

const observationResources = {
  "obs-router": {
    name: "route checkout request",
    startTime: "2026-06-16T13:58:22.120Z",
    type: "SPAN",
  },
  "obs-retrieve-products": {
    name: "retrieve similar products",
    startTime: "2026-06-16T13:58:22.430Z",
    type: "TOOL",
  },
  "obs-rerank-documents": {
    model: "cohere-rerank-v3.5",
    name: "rerank candidate documents",
    startTime: "2026-06-16T13:58:24.890Z",
    type: "GENERATION",
  },
  "obs-final-answer": {
    model: "gpt-4.1",
    name: "generate checkout answer",
    startTime: "2026-06-16T13:58:27.210Z",
    type: "GENERATION",
  },
  "obs-escalation-event": {
    name: "handoff to human support",
    startTime: "2026-06-16T13:52:21.300Z",
    type: "EVENT",
  },
  "obs-demo": {
    model: "gpt-4.1",
    name: "OpenAI generation",
    startTime: "2026-06-16T14:00:00.000Z",
    type: "GENERATION",
  },
} satisfies Record<
  string,
  {
    model?: string;
    name: string;
    startTime: string;
    type: string;
  }
>;

const scoreResources = {
  "score-groundedness": {
    dataType: "NUMERIC",
    name: "groundedness",
    source: "EVAL",
    timestamp: "2026-06-16T13:59:03.000Z",
    value: 0.41,
  },
  "score-relevance": {
    dataType: "CATEGORICAL",
    name: "retrieval_relevance",
    source: "ANNOTATION",
    timestamp: "2026-06-16T13:59:11.000Z",
    value: "low",
  },
  "score-escalated": {
    dataType: "BOOLEAN",
    name: "requires_escalation",
    source: "API",
    timestamp: "2026-06-16T13:59:17.000Z",
    value: true,
  },
  "score-review-note": {
    dataType: "TEXT",
    name: "review_note",
    source: "ANNOTATION",
    timestamp: "2026-06-16T13:59:26.000Z",
    value: "Reranker forwarded too many low-similarity documents.",
  },
  "score-demo": {
    dataType: "NUMERIC",
    name: "quality",
    source: "API",
    timestamp: "2026-06-16T14:00:00.000Z",
    value: 0.92,
  },
} satisfies Record<
  string,
  {
    dataType: string;
    name: string;
    source: string;
    timestamp: string;
    value: boolean | number | string;
  }
>;

const fakeResourceReferenceRenderer: InAppAgentResourceReferenceRenderer = ({
  resource,
  label,
  presentation,
}) => {
  if (resource.id.includes("loading")) {
    if (resource.type === "trace") {
      return (
        <InAppAgentResourceReferenceTrace
          id={resource.id}
          label={label}
          presentation={presentation}
          state="loading"
        />
      );
    }

    if (resource.type === "observation") {
      return (
        <InAppAgentResourceReferenceObservation
          id={resource.id}
          label={label}
          presentation={presentation}
          state="loading"
        />
      );
    }

    return (
      <InAppAgentResourceReferenceScore
        id={resource.id}
        label={label}
        presentation={presentation}
        state="loading"
      />
    );
  }

  if (resource.id.includes("deleted")) {
    if (resource.type === "trace") {
      return (
        <InAppAgentResourceReferenceTrace
          id={resource.id}
          label={label}
          presentation={presentation}
          state="unavailable"
        />
      );
    }

    if (resource.type === "observation") {
      return (
        <InAppAgentResourceReferenceObservation
          id={resource.id}
          label={label}
          presentation={presentation}
          state="unavailable"
        />
      );
    }

    return (
      <InAppAgentResourceReferenceScore
        id={resource.id}
        label={label}
        presentation={presentation}
        state="unavailable"
      />
    );
  }

  if (resource.type === "trace") {
    return (
      <InAppAgentResourceReferenceTrace
        href={`/project/project-demo/traces/${resource.id}`}
        id={resource.id}
        label={label}
        presentation={presentation}
        resource={traceResources[resource.id] ?? traceResources["trace-demo"]}
        state="loaded"
      />
    );
  }

  if (resource.type === "observation") {
    return (
      <InAppAgentResourceReferenceObservation
        href={`/project/project-demo/traces/${resource.traceId}?observation=${resource.id}`}
        id={resource.id}
        label={label}
        presentation={presentation}
        resource={
          observationResources[resource.id] ?? observationResources["obs-demo"]
        }
        state="loaded"
      />
    );
  }

  return (
    <InAppAgentResourceReferenceScore
      href={`/project/project-demo/scores?scoreId=${resource.id}`}
      id={resource.id}
      label={label}
      presentation={presentation}
      resource={scoreResources[resource.id] ?? scoreResources["score-demo"]}
      state="loaded"
    />
  );
};

function StatefulInAppAgentWindow(args: InAppAgentWindowProps) {
  const [isExpanded, setIsExpanded] = useState(args.isExpanded);

  return (
    <InAppAgentWindowStoryShell isExpanded={isExpanded}>
      {({ isHeaderDragHandleEnabled }) => (
        <InAppAgentWindow
          {...args}
          isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
          isExpanded={isExpanded}
          onExpandedChange={(isExpanded) => {
            setIsExpanded(isExpanded);
            args.onExpandedChange(isExpanded);
          }}
        />
      )}
    </InAppAgentWindowStoryShell>
  );
}

const streamingSeedMessages: InAppAgentWindowMessage[] = [
  {
    id: "seed-user-1",
    role: "user",
    content: {
      type: "text",
      text: "Find the cause of latency spikes in production traces.",
    },
  },
  {
    id: "seed-assistant-1",
    role: "assistant",
    content: {
      type: "text",
      text: "I will inspect recent traces, query latency metrics, and compare the slowest observations against scores and model usage.",
    },
  },
  {
    id: "seed-tool-1",
    role: "assistant",
    content: {
      type: "toolGroup",
      tools: [
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          args: JSON.stringify({
            view: "observations",
            metrics: [{ measure: "latency", aggregation: "p95" }],
            fromTimestamp: "2026-06-10T08:00:00Z",
            toTimestamp: "2026-06-10T09:00:00Z",
          }),
          result: JSON.stringify({ data: [{ p95_latency: 4.82 }] }),
        },
      ],
    },
  },
  ...(Array.from({ length: 8 }, (_, index) => ({
    id: `seed-follow-up-${index}`,
    role: index % 3 === 0 ? "user" : "assistant",
    content: {
      type: "text",
      text:
        index % 3 === 0
          ? `Can you narrow this down for service group ${index + 1}?`
          : [
              `Service group ${index + 1} has enough previous context to make this story scrollable before live streaming starts.`,
              "Scroll up while the assistant response streams to verify auto-follow detaches.",
              "Scroll back near the bottom to attach again.",
            ].join("\n"),
    },
  })) satisfies InAppAgentWindowMessage[]),
];

const streamingInvestigations = [
  {
    prompt: "Check whether the spike is isolated to retrieval.",
    intro:
      "I am checking retrieval-heavy traces first because their p95 latency moved before generation latency changed.",
    toolName: "langfuse_getTraces",
    toolArgs: {
      limit: 5,
      orderBy: "latency.desc",
      filter: "name contains retrieval",
    },
    toolResult: {
      data: [
        { traceId: "trace-ret-104", latencyMs: 5820 },
        { traceId: "trace-ret-219", latencyMs: 5410 },
      ],
    },
    conclusion:
      "The slowest traces are retrieval-heavy. The expensive step is document reranking, not the initial vector search.",
  },
  {
    prompt: "Compare the same window against quality scores.",
    intro:
      "Next I am joining the slow traces with score distributions so we can see whether the latency spike also changed output quality.",
    toolName: "langfuse_queryMetrics",
    toolArgs: {
      view: "scores",
      dimensions: ["scoreName"],
      metrics: [{ measure: "value", aggregation: "avg" }],
    },
    toolResult: {
      data: [
        { scoreName: "helpfulness", avg_value: 0.72 },
        { scoreName: "groundedness", avg_value: 0.68 },
      ],
    },
    conclusion:
      "Quality moved down in the same segment. The groundedness score dropped most, which fits a retrieval or reranking regression.",
  },
  {
    prompt: "Inspect model usage for the outlier traces.",
    intro:
      "I am checking model and token usage because a fallback model or larger context window can make otherwise healthy traces slow.",
    toolName: "langfuse_getObservations",
    toolArgs: {
      traceIds: ["trace-ret-104", "trace-ret-219"],
      columns: ["providedModelName", "totalTokens", "latency"],
    },
    toolResult: {
      data: [
        { providedModelName: "gpt-4.1", totalTokens: 18420, latencyMs: 3820 },
        { providedModelName: "gpt-4.1", totalTokens: 17610, latencyMs: 3610 },
      ],
    },
    conclusion:
      "Model choice is stable, but token counts are much higher than the baseline. The reranker is likely passing too many documents forward.",
  },
];

function appendToken(currentText: string, nextText: string) {
  if (currentText.length >= nextText.length) {
    return currentText;
  }

  const nextSpaceIndex = nextText.indexOf(" ", currentText.length + 1);

  return nextText.slice(
    0,
    nextSpaceIndex === -1 ? nextText.length : nextSpaceIndex,
  );
}

function StreamingInAppAgentWindow(args: InAppAgentWindowProps) {
  const [isExpanded, setIsExpanded] = useState(args.isExpanded);
  const [messages, setMessages] = useState<InAppAgentWindowMessage[]>(
    streamingSeedMessages,
  );
  type StreamingPhase =
    | "start"
    | "intro"
    | "tool-loading"
    | "tool-done"
    | "conclusion";

  const streamRef = useRef<{
    cycle: number;
    phase: StreamingPhase;
    phaseTicks: number;
    introMessageId: string;
    toolMessageId: string;
    conclusionMessageId: string;
  }>({
    cycle: 0,
    phase: "start",
    phaseTicks: 0,
    introMessageId: "",
    toolMessageId: "",
    conclusionMessageId: "",
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const stream = streamRef.current;
      const investigation =
        streamingInvestigations[stream.cycle % streamingInvestigations.length];

      if (stream.phase === "start") {
        const cycleId = `stream-${stream.cycle}`;
        stream.introMessageId = `${cycleId}-intro`;
        stream.toolMessageId = `${cycleId}-tool`;
        stream.conclusionMessageId = `${cycleId}-conclusion`;
        stream.phase = "intro";
        stream.phaseTicks = 0;

        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: `${cycleId}-user`,
            role: "user",
            content: { type: "text", text: investigation.prompt },
          },
          {
            id: stream.introMessageId,
            role: "assistant",
            content: { type: "text", text: "" },
          },
        ]);

        return;
      }

      if (stream.phase === "intro") {
        setMessages((currentMessages) =>
          currentMessages.map((message) => {
            if (
              message.id !== stream.introMessageId ||
              message.content.type !== "text"
            ) {
              return message;
            }

            const text = appendToken(message.content.text, investigation.intro);

            if (text === investigation.intro) {
              stream.phase = "tool-loading";
              stream.phaseTicks = 0;
            }

            return { ...message, content: { type: "text", text } };
          }),
        );

        return;
      }

      if (stream.phase === "tool-loading") {
        stream.phase = "tool-done";
        stream.phaseTicks = 0;

        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: stream.toolMessageId,
            role: "assistant",
            content: {
              type: "toolGroup",
              isLoading: true,
              tools: [
                {
                  type: "tool",
                  name: investigation.toolName,
                  args: JSON.stringify(investigation.toolArgs, null, 2),
                },
              ],
            },
          },
        ]);

        return;
      }

      if (stream.phase === "tool-done") {
        stream.phaseTicks += 1;

        if (stream.phaseTicks < 5) {
          return;
        }

        stream.phase = "conclusion";
        stream.phaseTicks = 0;

        setMessages((currentMessages) => [
          ...currentMessages.map((message) => {
            if (
              message.id !== stream.toolMessageId ||
              message.content.type !== "toolGroup"
            ) {
              return message;
            }

            return {
              ...message,
              content: {
                type: "toolGroup" as const,
                tools: [
                  {
                    type: "tool" as const,
                    name: investigation.toolName,
                    args: JSON.stringify(investigation.toolArgs, null, 2),
                    result: JSON.stringify(investigation.toolResult, null, 2),
                  },
                ],
              },
            };
          }),
          {
            id: stream.conclusionMessageId,
            role: "assistant",
            content: { type: "text", text: "" },
          },
        ]);

        return;
      }

      setMessages((currentMessages) =>
        currentMessages.map((message) => {
          if (
            message.id !== stream.conclusionMessageId ||
            message.content.type !== "text"
          ) {
            return message;
          }

          const text = appendToken(
            message.content.text,
            investigation.conclusion,
          );

          if (text === investigation.conclusion) {
            stream.cycle += 1;
            stream.phase = "start";
            stream.phaseTicks = 0;
          }

          return { ...message, content: { type: "text", text } };
        }),
      );
    }, 140);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <InAppAgentWindowStoryShell isExpanded={isExpanded}>
      {({ isHeaderDragHandleEnabled }) => (
        <InAppAgentWindow
          {...args}
          isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
          isExpanded={isExpanded}
          messages={messages}
          onExpandedChange={(isExpanded) => {
            setIsExpanded(isExpanded);
            args.onExpandedChange(isExpanded);
          }}
          onSubmit={(input) => {
            setMessages((currentMessages) => [
              ...currentMessages,
              {
                id: `manual-${currentMessages.length}`,
                role: "user",
                content: { type: "text", text: input },
              },
            ]);

            args.onSubmit(input);
            return true;
          }}
        />
      )}
    </InAppAgentWindowStoryShell>
  );
}

const conversations = [
  {
    id: "conversation-1",
    title: "Latency outliers",
    updatedAt: new Date("2026-05-19T10:00:00.000Z"),
  },
  {
    id: "conversation-2",
    title: "Score correlation",
    updatedAt: new Date("2026-05-19T09:00:00.000Z"),
  },
];

const longUnbrokenWord = `trace-${"0123456789abcdef".repeat(18)}`;
const longUnbrokenTableValue = `observation-${"abcdefghijklmnopqrstuvwxyz".repeat(10)}`;

const meta = preview.meta({
  component: InAppAgentWindow,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="flex h-screen w-full items-center justify-center">
        <Story />
      </div>
    ),
  ],
  args: {
    error: null,
    isExpanded: false,
    isInputDisabled: false,
    conversations,
    hasMoreConversations: false,
    isLoadingMoreConversations: false,
    selectedConversationId: undefined,
    onLoadMoreConversations: fn(),
    onNewConversation: fn(),
    onSelectConversation: fn(),
    onClose: fn(),
    onExpandedChange: fn(),
    onSubmit: fn(),
    onSubmitFeedback: fn(),
    renderResourceReference: fakeResourceReferenceRenderer,
    showCloseButton: true,
  },
  render: (args) => <StatefulInAppAgentWindow {...args} />,
});

export const Empty = meta.story({
  args: {
    messages: [],
  },
});

export const Conversation = meta.story({
  args: {
    selectedConversationId: "conversation-1",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Production checkout got slower after the latest prompt release. Can you find the traces and observations driving the regression?",
        },
      },
      {
        id: "assistant-tool-1",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_queryMetrics",
              args: JSON.stringify({
                view: "observations",
                dimensions: ["traceName", "observationType"],
                metrics: [
                  { measure: "latency", aggregation: "p95" },
                  { measure: "totalCost", aggregation: "sum" },
                ],
                filters: [
                  { column: "environment", operator: "=", value: "production" },
                  {
                    column: "traceName",
                    operator: "contains",
                    value: "checkout",
                  },
                ],
                fromTimestamp: "2026-06-16T13:30:00Z",
                toTimestamp: "2026-06-16T14:15:00Z",
              }),
              result: JSON.stringify({
                data: [
                  {
                    traceName: "checkout-agent / EU p95 spike",
                    observationType: "GENERATION",
                    p95_latency: 5.82,
                    sum_totalCost: 18.41,
                  },
                  {
                    traceName: "checkout-agent / baseline",
                    observationType: "GENERATION",
                    p95_latency: 1.34,
                    sum_totalCost: 4.93,
                  },
                ],
              }),
            },
            {
              type: "tool",
              name: "langfuse_getTraces",
              args: JSON.stringify({
                environment: "production",
                orderBy: "latency.desc",
                query: "checkout OR refund OR support",
                limit: 4,
              }),
              result: JSON.stringify({
                data: [
                  { traceId: "trace-checkout-p95", latencyMs: 5820 },
                  { traceId: "trace-refund-slow", latencyMs: 5410 },
                  { traceId: "trace-support-escalation", latencyMs: 4330 },
                  { traceId: "trace-checkout-baseline", latencyMs: 1340 },
                ],
              }),
            },
          ],
        },
      },
      {
        id: "assistant-text-1",
        role: "assistant",
        content: {
          type: "text",
          text: [
            "The regression is concentrated in [trace trace-checkout-p95](https://cloud.langfuse.com/project/project-demo/traces/trace-checkout-p95). It is about 4.3x slower than the baseline and has a higher total token cost.",
            "",
            "The baseline trace still looks healthy:",
            "",
            "https://cloud.langfuse.com/project/project-demo/traces/trace-checkout-baseline",
          ].join("\n"),
        },
      },
      {
        id: "assistant-trace-list",
        role: "assistant",
        content: {
          type: "text",
          text: [
            "These are the traces I would inspect first, ordered by latency:",
            "",
            "- [checkout p95 spike](https://cloud.langfuse.com/project/project-demo/traces/trace-checkout-p95)",
            "- [refund reranker timeout](https://cloud.langfuse.com/project/project-demo/traces/trace-refund-slow)",
            "- [support escalation handoff](https://cloud.langfuse.com/project/project-demo/traces/trace-support-escalation)",
          ].join("\n"),
        },
      },
      {
        id: "assistant-tool-2",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_getObservations",
              args: JSON.stringify({
                traceId: "trace-checkout-p95",
                columns: ["id", "type", "name", "model", "latency", "tokens"],
              }),
              result: JSON.stringify({
                data: [
                  { id: "obs-router", type: "SPAN", latencyMs: 110 },
                  { id: "obs-retrieve-products", type: "TOOL", latencyMs: 640 },
                  {
                    id: "obs-rerank-documents",
                    type: "GENERATION",
                    latencyMs: 3110,
                    model: "cohere-rerank-v3.5",
                  },
                  {
                    id: "obs-final-answer",
                    type: "GENERATION",
                    latencyMs: 1460,
                    model: "gpt-4.1",
                  },
                ],
              }),
            },
          ],
        },
      },
      {
        id: "assistant-observation-list",
        role: "assistant",
        content: {
          type: "text",
          text: [
            "The slow path is not the initial router. It starts after retrieval and peaks in reranking:",
            "",
            "- [route checkout request](https://cloud.langfuse.com/project/project-demo/traces/trace-checkout-p95?observation=obs-router)",
            "- [retrieve similar products](https://cloud.langfuse.com/project/project-demo/traces/trace-checkout-p95?observation=obs-retrieve-products)",
            "- [rerank candidate documents](https://cloud.langfuse.com/project/project-demo/traces/trace-checkout-p95?observation=obs-rerank-documents)",
            "- [generate checkout answer](https://cloud.langfuse.com/project/project-demo/traces/trace-checkout-p95?observation=obs-final-answer)",
            "",
            "The reranker is the main suspect: it runs before the final answer, and the final generation inherits a much larger context.",
          ].join("\n"),
        },
      },
      {
        id: "user-2",
        role: "user",
        content: {
          type: "text",
          text: "Does quality drop on the same traces, or is this only a latency issue?",
        },
      },
      {
        id: "assistant-score-list",
        role: "assistant",
        content: {
          type: "text",
          text: [
            "Quality drops on the same trace. The evaluation signals point to retrieval relevance, not model availability:",
            "",
            "- [groundedness](https://cloud.langfuse.com/project/project-demo/scores?scoreId=score-groundedness)",
            "- [retrieval relevance](https://cloud.langfuse.com/project/project-demo/scores?scoreId=score-relevance)",
            "- [requires escalation](https://cloud.langfuse.com/project/project-demo/scores?scoreId=score-escalated)",
            "- [review note](https://cloud.langfuse.com/project/project-demo/scores?scoreId=score-review-note)",
          ].join("\n"),
        },
      },
      {
        id: "assistant-mixed-resources",
        role: "assistant",
        content: {
          type: "text",
          text: [
            "Recommended next steps:",
            "",
            "- Compare [trace trace-checkout-p95](https://cloud.langfuse.com/project/project-demo/traces/trace-checkout-p95) with the baseline trace before changing the prompt again.",
            "- Inspect [rerank candidate documents](https://cloud.langfuse.com/project/project-demo/traces/trace-checkout-p95?observation=obs-rerank-documents) for the number of documents forwarded into the final generation.",
            "- Use [retrieval relevance](https://cloud.langfuse.com/project/project-demo/scores?scoreId=score-relevance) as the regression guardrail for the rollback.",
            "",
            "I am still waiting for one background score and one deleted trace reference to resolve, which should stay visibly distinct:",
            "",
            "- [loading score](https://cloud.langfuse.com/project/project-demo/scores?scoreId=loading-score)",
            "- [deleted trace](https://cloud.langfuse.com/project/project-demo/traces/deleted-trace)",
          ].join("\n"),
        },
      },
      {
        id: "assistant-markdown-coverage",
        role: "assistant",
        content: {
          type: "text",
          text: [
            "# Heading 1",
            "## Heading 2",
            "### Heading 3",
            "#### Heading 4",
            "##### Heading 5",
            "###### Heading 6",
            "",
            "You can use **Langfuse** to inspect _production traces_ and compare `input`, `output`, and metadata across releases.",
            "",
            "- Inspect traces with nested observations",
            "- Evaluate outputs with scores",
            "- Monitor production quality over time",
            "",
            "1. Filter for `level = ERROR`.",
            "2. Open the slowest trace.",
            "3. Compare model settings and prompt versions.",
            "",
            "> Tip: add scores and metadata early so regressions are easier to segment later.",
            "",
            "| Signal | Where to look |",
            "| --- | --- |",
            "| Latency | Observation timings |",
            "| Cost | Usage and model pricing |",
            "| Quality | Scores and comments |",
            "",
            "```ts",
            "const trace = {",
            '  name: "checkout-agent",',
            '  environment: "production",',
            '  metadata: { region: "eu" },',
            "};",
            "```",
            "",
            "Streaming partial markdown:",
            "",
            "- The assistant can render a list item while it is still streaming",
            "- It can also keep an unfinished **bold phrase",
            "",
            "```json",
            "{",
            '  "status": "streaming",',
            '  "next": "content still arriving"',
          ].join("\n"),
        },
      },
      {
        id: "user-long-word",
        role: "user",
        content: {
          type: "text",
          text: `This normal message includes a very long unbroken word to check wrapping: ${longUnbrokenWord}`,
        },
      },
      {
        id: "assistant-long-word",
        role: "assistant",
        content: {
          type: "text",
          text: `This normal message includes a very long unbroken word to check wrapping: ${longUnbrokenWord}`,
        },
      },
      {
        id: "assistant-long-table",
        role: "assistant",
        content: {
          type: "text",
          text: [
            "Some trace attributes can contain very long values without spaces:",
            "",
            "| Field | Value | Notes |",
            "| --- | --- | --- |",
            `| Trace ID | ${longUnbrokenWord} | Generated by a customer system without delimiters |`,
            `| Observation ID | ${longUnbrokenTableValue} | Long table cell value without spaces |`,
            `| Metadata key | custom-${longUnbrokenTableValue} | Another long unbroken token in a different column |`,
          ].join("\n"),
        },
      },
    ],
  },
});

export const Streaming = meta.story({
  args: {
    selectedConversationId: "conversation-1",
    messages: streamingSeedMessages,
  },
  render: (args) => <StreamingInAppAgentWindow {...args} />,
});

export const LoadingResponse = meta.story({
  args: {
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Summarize recent ingestion errors.",
        },
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: {
          type: "loading",
        },
      },
    ],
  },
});

export const LoadingAfterToolCall = meta.story({
  args: {
    isInputDisabled: true,
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "How many OpenAI tokens were used last week?",
        },
      },
      {
        id: "assistant-tool-1",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_queryMetrics",
              args: JSON.stringify({
                view: "observations",
                metrics: [{ measure: "totalTokens", aggregation: "sum" }],
                filters: [
                  {
                    column: "providedModelName",
                    operator: "contains",
                    value: "gpt",
                    type: "string",
                  },
                ],
              }),
              result: JSON.stringify({
                data: [{ sum_totalTokens: 6848204 }],
              }),
            },
          ],
        },
      },
      {
        id: "assistant-text-1",
        role: "assistant",
        content: {
          type: "text",
          text: "Let me check what model names are available to better identify OpenAI models.",
        },
      },
      {
        id: "assistant-tool-2",
        role: "assistant",
        content: {
          type: "toolGroup",
          isLoading: true,
          tools: [
            {
              type: "tool",
              name: "langfuse_getObservationFilterValues",
              args: JSON.stringify({
                column: "providedModelName",
                limit: 50,
                fromStartTime: "2026-06-01T00:00:00Z",
                toStartTime: "2026-06-08T00:00:00Z",
              }),
              result: JSON.stringify({
                type: "VALUES",
                column: "providedModelName",
                values: [
                  {
                    value: "gpt-4",
                    count: 41700,
                  },
                ],
              }),
            },
          ],
        },
      },
    ],
  },
});

export const Connecting = meta.story({
  args: {
    isInputDisabled: true,
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Summarize recent ingestion errors.",
        },
      },
      {
        id: "connecting",
        role: "assistant",
        content: {
          type: "loading",
          label: "Connecting...",
        },
      },
    ],
  },
});

export const Error = meta.story({
  args: {
    error: "Assistant is not enabled for this user",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Help me inspect this trace.",
        },
      },
    ],
  },
});
