import preview from "../../../../../.storybook/preview";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { InAppAgentMessage } from "./InAppAgentMessage";

const meta = preview.meta({
  component: InAppAgentMessage,
});

function copySelectedNode(node: Node, document: Document) {
  const range = document.createRange();
  range.selectNodeContents(node);

  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  const clipboardData = new DataTransfer();
  const copyEvent = new ClipboardEvent("copy", {
    bubbles: true,
    cancelable: true,
    clipboardData,
  });
  node.dispatchEvent(copyEvent);

  return { clipboardData, copyEvent };
}

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

export const AssistantTextWithRedirectAction = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: "I found the members settings page for this project.",
      redirectAction: {
        type: "redirectAction",
        label: "Open members",
        href: "/project/project-1/settings/members",
      },
    },
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
        "You can use **[Langfuse](https://langfuse.com)** to inspect _production traces_ and compare `input`, `output`, `metadata` and `scores` across releases.",
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

export const CopyMarkdownSelectionInteraction = meta.story({
  name: "(Test) Copy Markdown Selection",
  args: {
    role: "assistant",
    content: {
      type: "text",
      text: [
        "You can use **[Langfuse](https://langfuse.com)** to inspect _production traces_ and compare `input` values.",
        "",
        "Repeated text appears here.",
        "",
        "# Repeated text appears here.",
        "",
        "* Inspect [Wiki](https://en.wikipedia.org/wiki/Foo_(bar)) links.",
        "",
        "```ts",
        "const value = `**```x```**`;",
        "```",
      ].join("\n"),
    },
  },
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const message = canvasElement.querySelector("[data-compact]");
    await expect(message).not.toBeNull();
    if (!message) {
      return;
    }

    const firstParagraph = message.querySelector("p");
    await expect(firstParagraph).not.toBeNull();
    if (!firstParagraph) {
      return;
    }

    const { clipboardData, copyEvent } = copySelectedNode(
      firstParagraph,
      document,
    );

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(clipboardData.getData("text/plain")).toBe(
      "You can use **[Langfuse](https://langfuse.com)** to inspect _production traces_ and compare `input` values.",
    );
    expect(clipboardData.getData("text/html")).toBe(
      'You can use <strong><a href="https://langfuse.com/" target="_blank" rel="noopener noreferrer">Langfuse</a></strong> to inspect <em>production traces</em> and compare <code>input</code> values.',
    );

    const heading = message.querySelector("h1");
    await expect(heading).not.toBeNull();
    if (!heading?.firstChild) {
      return;
    }

    const { clipboardData: headingClipboardData, copyEvent: headingCopyEvent } =
      copySelectedNode(heading, document);

    expect(headingCopyEvent.defaultPrevented).toBe(true);
    expect(headingClipboardData.getData("text/plain")).toBe(
      "# Repeated text appears here.",
    );

    const listItem = message.querySelector("li");
    await expect(listItem).not.toBeNull();
    if (!listItem) {
      return;
    }

    const { clipboardData: listClipboardData, copyEvent: listCopyEvent } =
      copySelectedNode(listItem, document);

    expect(listCopyEvent.defaultPrevented).toBe(true);
    expect(listClipboardData.getData("text/plain")).toBe(
      "* Inspect [Wiki](https://en.wikipedia.org/wiki/Foo_(bar)) links.",
    );

    const codeBlock = message.querySelector("pre");
    await expect(codeBlock).not.toBeNull();
    if (!codeBlock) {
      return;
    }

    const { clipboardData: codeClipboardData, copyEvent: codeCopyEvent } =
      copySelectedNode(codeBlock, document);

    expect(codeCopyEvent.defaultPrevented).toBe(true);
    expect(codeClipboardData.getData("text/plain")).toBe(
      "const value = `**```x```**`;",
    );
    expect(codeClipboardData.getData("text/html")).not.toContain("Copy code");
    expect(codeClipboardData.getData("text/html")).not.toContain("button");
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
          status: "succeeded",
          args: JSON.stringify({ view: "observations" }),
          result: JSON.stringify({ data: [{ count_count: 0 }] }),
        },
        {
          type: "tool",
          name: "langfuse_getTraces",
          status: "succeeded",
          args: JSON.stringify({ limit: 10 }),
          result: JSON.stringify({ data: [] }),
        },
      ],
    },
  },
});

export const MixedToolCallStatuses = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "toolGroup",
      tools: [
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          status: "succeeded",
          args: JSON.stringify({ view: "observations" }),
          result: JSON.stringify({ data: [{ count_count: 42 }] }),
        },
        {
          type: "tool",
          name: "langfuse_getTraces",
          status: "failed",
          args: JSON.stringify({ limit: 10 }),
          error: "Failed to load traces: missing project access.",
        },
        {
          type: "tool",
          name: "langfuse_upsertDataset",
          status: "denied",
          args: JSON.stringify({ name: "regression-examples" }),
          result: "Tool call was not approved by the user.",
          error: "Tool call was not approved by the user.",
        },
      ],
    },
  },
});

export const CompactMixedToolCallStatuses = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "toolGroup",
      tools: [
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          status: "succeeded",
          args: JSON.stringify({ view: "observations" }),
          result: JSON.stringify({ data: [{ count_count: 42 }] }),
        },
        {
          type: "tool",
          name: "langfuse_getTraces",
          status: "failed",
          args: JSON.stringify({ limit: 10 }),
          error: "Failed to load traces: missing project access.",
        },
        {
          type: "tool",
          name: "langfuse_upsertDataset",
          status: "denied",
          args: JSON.stringify({ name: "regression-examples" }),
          result: "Tool call was not approved by the user.",
          error: "Tool call was not approved by the user.",
        },
      ],
    },
    isCompact: true,
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
          status: "succeeded",
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

export const RedirectAction = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "redirectAction",
      label: "Open members",
      href: "/project/project-1/settings/members",
    },
  },
});

export const RedirectActionWithParams = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "redirectAction",
      label: "Open error traces",
      href: "/project/project-1/traces?dateRange=1d&search=checkout&searchType=content&filter=level%3BstringOptions%3B%3Bany+of%3BERROR",
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
          status: "succeeded",
          args: JSON.stringify({ view: "observations" }),
          result: JSON.stringify({ data: [{ count_count: 0 }] }),
        },
        {
          type: "tool",
          name: "langfuse_getTraces",
          status: "running",
          args: JSON.stringify({ limit: 10 }),
        },
      ],
    },
  },
});

const longReasoningText = [
  "Reading the current trace context and the visible filters.",
  "Checking whether the user is asking about latency, quality, or cost first.",
  "Comparing recent observations with error levels and score names.",
  "Looking for a small query that can answer the next step without changing project state.",
  "Keeping this text long enough to span several lines so the block visibly grows with its content.",
  "The last line should be visible after mount and after streamed updates.",
].join("\n");

export const Reasoning = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "reasoning",
      text: "Checking recent traces before querying metrics.",
      isStreaming: false,
    },
  },
});

export const CompletedReasoning = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "reasoning",
      text: longReasoningText,
      isStreaming: false,
    },
  },
});

export const StreamingReasoning = meta.story({
  args: {
    role: "assistant",
    content: {
      type: "reasoning",
      text: longReasoningText,
      isStreaming: true,
    },
  },
});

export const CompactStreamingReasoning = meta.story({
  args: {
    role: "assistant",
    isCompact: true,
    content: {
      type: "reasoning",
      text: longReasoningText,
      isStreaming: true,
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
    await waitFor(() => expect(commentInput).toBeVisible());

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
