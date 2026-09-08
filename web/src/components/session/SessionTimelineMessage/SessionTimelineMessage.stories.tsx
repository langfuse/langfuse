import preview from "@/.storybook/preview";
import { expect, userEvent, within } from "storybook/test";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";

import { SessionTimelineMessage } from "@/src/components/session/SessionTimelineMessage/SessionTimelineMessage";

const meta = preview.meta({
  component: SessionTimelineMessage,
  parameters: { layout: "padded", a11y: { test: "error" } },
});

export default meta;

export const Assistant = meta.story({
  args: {
    message: {
      role: "assistant",
      source: "output",
      parts: [
        {
          type: "text",
          text: "The normalized parser preserves **markdown**, structured data, and provider-independent message roles.",
        },
      ],
      finishReason: { type: "stop", raw: "stop" },
    } satisfies NormalizedMessage,
  },
});

export const NamedUser = meta.story({
  args: {
    message: {
      role: "user",
      senderName: "Customer",
      source: "input",
      parts: [
        {
          type: "text",
          text: "Find the latest documentation and summarize the relevant section.",
        },
      ],
    } satisfies NormalizedMessage,
  },
});

export const SystemPrompt = meta.story({
  args: {
    message: {
      role: "system",
      source: "input",
      parts: [
        {
          type: "text",
          text: "Answer using the product documentation and cite relevant sources.",
        },
      ],
    } satisfies NormalizedMessage,
  },
});

export const StructuredData = meta.story({
  args: {
    message: {
      role: "tool",
      source: "input",
      parts: [
        {
          type: "data",
          name: "confidence",
          value: 0.9,
        },
        {
          type: "custom",
          kind: "citation",
          value: 7,
        },
      ],
    } satisfies NormalizedMessage,
  },
});

export const ToolCall = meta.story({
  args: {
    message: {
      role: "assistant",
      source: "output",
      parts: [
        {
          type: "tool-call",
          toolCallId: "call-search-1",
          toolName: "search_documentation",
          input: { resultLimit: 3 },
        },
        {
          type: "tool-result",
          toolCallId: "call-search-1",
          toolName: "search_documentation",
          output: { resultCount: 3 },
        },
      ],
    } satisfies NormalizedMessage,
  },
});

export const Reasoning = meta.story({
  args: {
    message: {
      role: "assistant",
      source: "output",
      parts: [
        {
          type: "reasoning",
          content: {
            kind: "text",
            text: "I should compare the observation payloads before answering.",
          },
        },
        {
          type: "reasoning",
          content: { kind: "redacted", data: "encrypted-provider-payload" },
        },
        { type: "text", text: "Here is the result." },
      ],
    } satisfies NormalizedMessage,
  },
});

export const ExpandToolCall = meta.story({
  name: "(Test) Expands Tool Call",
  args: ToolCall.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /search_documentation/i }),
    );
    await expect(canvas.getByText("call-search-1")).toBeVisible();
  },
});

export const ExpandSystemPrompt = meta.story({
  name: "(Test) Expands System Prompt",
  args: SystemPrompt.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const content =
      "Answer using the product documentation and cite relevant sources.";
    const trigger = canvas.getByRole("button", { name: "System prompt" });
    const initialLeft = trigger.getBoundingClientRect().left;

    await expect(trigger.closest(".ph-no-capture")).not.toHaveClass(
      "justify-center",
    );
    await expect(canvasElement.querySelector(".border-dashed")).toBeVisible();
    await expect(trigger).toHaveClass("font-normal");
    await expect(trigger).not.toHaveClass("font-bold");
    await expect(canvas.queryByText(content)).not.toBeInTheDocument();
    await userEvent.click(trigger);
    const systemPrompt = canvas.getByText(content);
    await expect(systemPrompt).toBeVisible();
    await expect(systemPrompt.closest(".border-l")).toBeNull();
    await expect(systemPrompt.getBoundingClientRect().left).toBe(initialLeft);
    await expect(trigger.getBoundingClientRect().left).toBe(initialLeft);
  },
});

export const RenderSupportedParts = meta.story({
  name: "(Test) Renders Supported Parts",
  parameters: { a11y: { test: "off" } },
  args: {
    message: {
      role: "tool",
      source: "output",
      parts: [
        { type: "reasoning", content: { kind: "text", text: "Think" } },
        {
          type: "tool-result",
          toolCallId: "call-hidden-result",
          toolName: "hidden_search_result",
          output: { result: "found" },
        },
        { type: "data", value: { confidence: 0.9 } },
        { type: "custom", kind: "citation", value: { id: "doc-1" } },
      ],
    } satisfies NormalizedMessage,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Reasoning")).toBeInTheDocument();
    await expect(canvas.queryByText("Think")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Reasoning" }));
    await expect(canvas.getByText("Think")).toBeVisible();
    await expect(
      canvas.queryByText("hidden_search_result"),
    ).not.toBeInTheDocument();
    await expect(canvasElement).toHaveTextContent("confidence");
    await expect(canvasElement).toHaveTextContent("citation");
  },
});

export const RejectUnsafeFileUrl = meta.story({
  name: "(Test) Rejects Unsafe File URL",
  parameters: { a11y: { test: "off" } },
  args: {
    message: {
      role: "assistant",
      source: "output",
      parts: [
        {
          type: "file",
          content: { kind: "url", url: "javascript:alert(1)" },
        },
      ],
    } satisfies NormalizedMessage,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvasElement).toHaveTextContent("javascript:alert(1)");
  },
});
