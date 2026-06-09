import preview from "../../../../.storybook/preview";
import { InAppAgentMessage } from "./InAppAgentMessage";

const meta = preview.meta({
  component: InAppAgentMessage,
});

export const AssistantText = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: "Langfuse tracks traces, observations, scores, and metadata so teams can debug LLM applications.",
    },
  },
});

export const AssistantMarkdown = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: [
        "## Debugging checklist",
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
