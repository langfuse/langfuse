import preview from "../../../../../.storybook/preview";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  InAppAgentResourceReferenceObservation,
  InAppAgentResourceReferenceScore,
  InAppAgentResourceReferenceTrace,
} from "./InAppAgentResourceReference";
import {
  InAppAgentMessage,
  type InAppAgentResourceReferenceRenderer,
} from "./InAppAgentMessage";

const meta = preview.meta({
  component: InAppAgentMessage,
});

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
        resource={{
          environment: "production",
          name: "checkout-agent",
          timestamp: "2026-06-16T14:00:00.000Z",
          userId: "user-42",
        }}
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
        resource={{
          model: "gpt-4.1",
          name: "OpenAI generation",
          startTime: "2026-06-16T14:00:00.000Z",
          type: "GENERATION",
        }}
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
      resource={{
        dataType: "NUMERIC",
        name: "quality",
        source: "API",
        timestamp: "2026-06-16T14:00:00.000Z",
        value: 0.92,
      }}
      state="loaded"
    />
  );
};

export const AssistantText = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: "Langfuse tracks traces, observations, scores, and metadata so teams can debug LLM applications.",
    },
  },
});

export const AssistantTextWithFeedback = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: "Langfuse tracks traces, observations, scores, and metadata so teams can debug LLM applications.",
    },
    onSubmitFeedback: fn(),
  },
});

export const AssistantTextWithSources = meta.story({
  args: {
    role: "assistant" as const,
    content: {
      type: "text" as const,
      text: "Scores are Langfuse's universal data object for storing evaluation results.",
      sources: [
        {
          title: "Scores",
          url: "https://langfuse.com/docs/evaluation/scores/overview",
          faviconUrl: "https://langfuse.com/favicon.ico",
        },
        {
          title: "Scores Data Model",
          url: "https://langfuse.com/docs/evaluation/scores/data-model",
          faviconUrl: "https://langfuse.com/favicon.ico",
        },
      ],
    },
    onSubmitFeedback: fn(),
  },
});

export const ShortAssistantTextWithFeedback = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: "OK",
    },
    onSubmitFeedback: fn(),
  },
});

export const AssistantTextWithFeedbackComment = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: "Langfuse tracks traces, observations, scores, and metadata so teams can debug LLM applications.",
      feedback: {
        value: "thumbs_up",
        comment: "Helpful answer.",
      },
    },
    onSubmitFeedback: fn(),
  },
});

export const AssistantTextWithLongFeedbackComment = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: "Langfuse tracks traces, observations, scores, and metadata so teams can debug LLM applications.",
      feedback: {
        value: "thumbs_down",
        comment:
          "Contrary to popular belief, Lorem Ipsum is not simply random text. It has roots in a piece of classical Latin literature from 45 BC, making it over 2000 years old. Richard McClintock, a Latin professor at Hampden-Sydney College in Virginia, looked up one of the more obscure Latin words, consectetur, from a Lorem Ipsum passage, and going through the cites of the word in classical literature, discovered the undoubtable source.",
      },
    },
    onSubmitFeedback: fn(),
  },
});

export const AssistantMarkdown = meta.story({
  args: {
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
        "You can use **Langfuse** to inspect _production traces_ and compare `input`, `output`, `metadata` and `scores` across releases.",
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
});

export const AssistantResourceReferences = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: [
        "The latency spike starts in [trace trace-demo](https://cloud.langfuse.com/project/project-demo/traces/trace-demo) and appears related to the generation step.",
        "",
        "https://cloud.langfuse.com/project/project-demo/traces/trace-demo",
        "",
        "- [observation obs-demo](https://cloud.langfuse.com/project/project-demo/traces/trace-demo?observation=obs-demo)",
        "- [score score-demo](https://cloud.langfuse.com/project/project-demo/scores?scoreId=score-demo)",
        "- [deleted trace](https://cloud.langfuse.com/project/project-demo/traces/deleted-trace)",
        "- [loading score](https://cloud.langfuse.com/project/project-demo/scores?scoreId=loading-score)",
        "",
        "Regular links still render normally: [Langfuse docs](https://langfuse.com/docs).",
      ].join("\n"),
    },
    renderResourceReference: fakeResourceReferenceRenderer,
  },
});

export const AssistantTraceList = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: [
        "These traces had the highest latency:",
        "",
        "- [trace trace-demo](https://cloud.langfuse.com/project/project-demo/traces/trace-demo)",
        "- [trace trace-demo-2](https://cloud.langfuse.com/project/project-demo/traces/trace-demo-2)",
        "- [trace trace-demo-3](https://cloud.langfuse.com/project/project-demo/traces/trace-demo-3)",
      ].join("\n"),
    },
    renderResourceReference: fakeResourceReferenceRenderer,
  },
});

export const AssistantObservationList = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: [
        "The slow path is concentrated in these observations:",
        "",
        "- [generation obs-demo](https://cloud.langfuse.com/project/project-demo/traces/trace-demo?observation=obs-demo)",
        "- [tool obs-demo-2](https://cloud.langfuse.com/project/project-demo/traces/trace-demo?observation=obs-demo-2)",
        "- [span obs-demo-3](https://cloud.langfuse.com/project/project-demo/traces/trace-demo?observation=obs-demo-3)",
      ].join("\n"),
    },
    renderResourceReference: fakeResourceReferenceRenderer,
  },
});

export const AssistantMixedResourceList = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: [
        "Mixed resource types stay as normal markdown:",
        "",
        "- [trace trace-demo](https://cloud.langfuse.com/project/project-demo/traces/trace-demo)",
        "- [observation obs-demo](https://cloud.langfuse.com/project/project-demo/traces/trace-demo?observation=obs-demo)",
        "- [score score-demo](https://cloud.langfuse.com/project/project-demo/scores?scoreId=score-demo)",
      ].join("\n"),
    },
    renderResourceReference: fakeResourceReferenceRenderer,
  },
});

export const AssistantMixedList = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: [
        "Mixed lists stay as normal markdown:",
        "",
        "- Check the latency trend first",
        "- [trace trace-demo](https://cloud.langfuse.com/project/project-demo/traces/trace-demo)",
        "- Then compare the generation output",
      ].join("\n"),
    },
    renderResourceReference: fakeResourceReferenceRenderer,
  },
});

export const UserText = meta.story({
  args: {
    role: "user",
    content: {
      type: "text",
      text: "How do I find failed traces from the last 24 hours?",
    },
  },
});

export const ToolCallGroup = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "toolGroup",
      tools: [
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          args: JSON.stringify({ view: "observations" }),
          result: JSON.stringify({ data: [{ count_count: 0 }] }),
        },
        {
          type: "tool",
          name: "langfuse_getTraces",
          args: JSON.stringify({ limit: 10 }),
          result: JSON.stringify({ data: [] }),
        },
      ],
    },
  },
});

export const SingleToolCallGroup = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "toolGroup",
      tools: [
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          args: JSON.stringify(
            {
              view: "observations",
              dimensions: [],
              metrics: [{ measure: "count", aggregation: "count" }],
              filters: [],
              fromTimestamp: "2025-06-30T00:00:00Z",
              toTimestamp: "2025-07-06T23:59:59Z",
            },
            null,
            2,
          ),
          result: JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({ data: [{ count_count: 0 }] }, null, 2),
              },
            ],
          }),
        },
      ],
    },
  },
});

export const LoadingToolCallGroup = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "toolGroup",
      isLoading: true,
      tools: [
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          args: JSON.stringify({ view: "observations" }),
          result: JSON.stringify({ data: [{ count_count: 0 }] }),
        },
        {
          type: "tool",
          name: "langfuse_getTraces",
          args: JSON.stringify({ limit: 10 }),
        },
      ],
    },
  },
});

export const Loading = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "loading",
    },
  },
});

export const Connecting = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "loading",
      label: "Connecting...",
    },
  },
});

export const FeedbackPopoverInteraction = meta.story({
  name: "(Test) Feedback Popover Interaction",
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: "Langfuse tracks traces, observations, scores, and metadata so teams can debug LLM applications.",
    },
    onSubmitFeedback: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await canvas.findByRole("button", { name: "Good response" }),
    );

    const commentInput = await body.findByPlaceholderText(
      "Optional feedback comment",
    );
    await expect(commentInput).toBeVisible();

    const saveButton = await body.findByRole("button", {
      name: "Save comment",
    });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(
        body.queryByPlaceholderText("Optional feedback comment"),
      ).not.toBeInTheDocument();
    });
  },
});
