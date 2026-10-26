import preview from "../../../../../.storybook/preview";
import { expect, within } from "storybook/test";
import { IOPreviewPretty } from "./IOPreviewPretty";

const meta = preview.meta({
  component: IOPreviewPretty,
  args: {
    projectId: "storybook-project",
    traceId: "storybook-trace",
    // Keep this false: the correction editor uses private tRPC APIs and is not isolated for Storybook.
    showCorrections: false,
  },
});

export const Default = meta.story({
  args: {
    input: {
      customerId: "customer-123",
      question: "How do I reduce API latency?",
    },
    output: {
      recommendation: "Enable prompt caching and stream the response.",
      latencyMs: 842,
    },
  },
});

export const OversizedSibling = meta.story({
  args: {
    input: {
      attachment: JSON.stringify({ text: "x".repeat(523_000) }),
      details: JSON.stringify({ status: "ready", count: 2 }),
    },
  },
});

export const LongSystemPrompt = meta.story({
  args: {
    input: {
      messages: [
        {
          role: "system",
          content: Array.from(
            { length: 12 },
            (_, i) =>
              `system-prompt-line-${i + 1} lorem ipsum dolor sit amet consectetur adipiscing elit`,
          ).join("\n"),
        },
        {
          role: "user",
          content: "Summarize the constraints above.",
        },
      ],
    },
    output: {
      role: "assistant",
      content: "Stay within the listed role and constraints.",
    },
  },
});

export const MarkdownWithCodeBlock = meta.story({
  args: {
    input: {
      messages: [
        {
          role: "system",
          content: `Use this tracing configuration:

\`\`\`typescript
const trace = langfuse.trace({
  name: "support-workflow",
});
\`\`\``,
        },
        {
          role: "user",
          content: "How can I record a generation?",
        },
      ],
    },
    output: {
      role: "assistant",
      content: `Use the Langfuse SDK to wrap the model call:

\`\`\`typescript
const generation = trace.generation({
  name: "support-answer",
  model: "example-model",
});

generation.end({ output: "Your response" });
\`\`\``,
    },
  },
});

export const NestedMarkdownLists = meta.story({
  args: {
    input: {
      messages: [
        {
          role: "user",
          content: "What is Langfuse useful for?",
        },
      ],
    },
    output: {
      role: "assistant",
      content: `Langfuse is an open-source observability and analytics tool for LLM applications.

In practical terms, it helps you:

- **Track and debug LLM calls**
  - Log prompts, model responses, latency, errors, and metadata
- **Evaluate quality**
  - Run evaluations on outputs (automatic metrics or human feedback)
- **Monitor in production**
  - Dashboards for usage, cost, latency, and failure rates`,
    },
  },
});

export const ToolCall = meta.story({
  args: {
    input: {
      messages: [
        {
          role: "system",
          content: "Use tools when they can provide a precise answer.",
          tools: [
            {
              name: "search_docs",
              description: "Search the product documentation.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" },
                },
                required: ["query"],
              },
            },
          ],
        },
        {
          role: "user",
          content: "Where can I find trace latency?",
        },
      ],
    },
    output: {
      role: "assistant",
      tool_calls: [
        {
          id: "call-search-docs",
          name: "search_docs",
          arguments: JSON.stringify({ query: "trace latency" }),
        },
      ],
    },
  },
});

export const MetadataNotInPreview = meta.story({
  args: {
    input: "Summarize this support conversation.",
    output: "The customer needs help configuring prompt caching.",
    metadata: {
      model: "example-model",
      region: "eu-west-1",
      cached: true,
    },
  },
});

export const Loading = meta.story({
  args: {
    input: {
      question: "How do I configure evaluations?",
    },
    output: null,
    isLoading: true,
  },
});

export const SpanWithChatMessages = meta.story({
  name: "(Test) Span keeps role titles",
  args: {
    observationType: "SPAN",
    input: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi, how can I help?" },
      { role: "user", content: "a nice car" },
    ],
    output: [{ role: "assistant", content: "sure" }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Each message mounts a formatted and a hidden JSON header.
    await expect(canvas.getAllByText("user").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("assistant").length).toBeGreaterThan(0);
    await expect(canvas.queryAllByText("Input")).toHaveLength(0);
    await expect(canvas.queryAllByText("Output")).toHaveLength(0);
  },
});

export const SpanWithPlainText = meta.story({
  name: "(Test) Span titles plain text by side",
  args: {
    observationType: "SPAN",
    input: "Summarize this support conversation.",
    output: "The customer needs help configuring prompt caching.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Input").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("Output").length).toBeGreaterThan(0);
    await expect(canvas.queryAllByText("user")).toHaveLength(0);
  },
});

export const Empty = meta.story({
  name: "(Test) Empty",
  args: { input: undefined, output: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByText("undefined", { exact: true }),
    ).toHaveLength(2);
  },
});
