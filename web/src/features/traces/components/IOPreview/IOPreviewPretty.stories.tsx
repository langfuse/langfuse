import preview from "../../../../../.storybook/preview";
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

export const WithMetadata = meta.story({
  args: {
    input: "Summarize this support conversation.",
    output: "The customer needs help configuring prompt caching.",
    metadata: {
      model: "example-model",
      region: "eu-west-1",
      cached: true,
    },
    showMetadata: true,
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
