import preview from "@/.storybook/preview";
import { expect, userEvent, within } from "storybook/test";

import { type SessionTimelineConversationMessage } from "@/src/components/session/SessionConversationTimeline/fns/processTimelineMessages";
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
    } satisfies SessionTimelineConversationMessage,
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
    } satisfies SessionTimelineConversationMessage,
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
    } satisfies SessionTimelineConversationMessage,
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
    } satisfies SessionTimelineConversationMessage,
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
        { type: "text", text: "Here is the result." },
      ],
    } satisfies SessionTimelineConversationMessage,
  },
});

export const ReasoningData = meta.story({
  args: {
    message: {
      role: "assistant",
      source: "output",
      parts: [
        {
          type: "reasoning",
          content: {
            kind: "data",
            value: { checks: ["source available", "answer supported"] },
          },
        },
        { type: "text", text: "The answer is supported by the source." },
      ],
    } satisfies SessionTimelineConversationMessage,
  },
});

export const RedactedReasoning = meta.story({
  args: {
    message: {
      role: "assistant",
      source: "output",
      parts: [
        {
          type: "reasoning",
          content: { kind: "redacted", data: "redacted-provider-payload" },
        },
        { type: "text", text: "Here is the result." },
      ],
    } satisfies SessionTimelineConversationMessage,
  },
});

export const EncryptedReasoning = meta.story({
  args: {
    message: {
      role: "assistant",
      source: "output",
      parts: [
        {
          type: "reasoning",
          content: { kind: "encrypted", data: "encrypted-provider-payload" },
        },
        { type: "text", text: "Here is the result." },
      ],
    } satisfies SessionTimelineConversationMessage,
  },
});

export const EmbeddedImages = meta.story({
  args: {
    message: {
      role: "user",
      source: "input",
      parts: [
        {
          type: "text",
          text: "Here are a landscape image and a square image.",
        },
        {
          type: "file",
          filename: "product-overview.jpg",
          mediaType: "image/jpeg",
          content: { kind: "url", url: "/assets/v4-beta-intro.jpg" },
        },
        {
          type: "file",
          filename: "app-icon.png",
          mediaType: "image/png",
          content: { kind: "url", url: "/icon256.png" },
        },
      ],
    } satisfies SessionTimelineConversationMessage,
  },
});

export const FileAttachment = meta.story({
  name: "(Test) File Attachment Layout",
  args: {
    message: {
      role: "user",
      source: "input",
      parts: [
        {
          type: "text",
          text: "Here is the report from the inspection.",
        },
        {
          type: "file",
          filename: "inspection-report.pdf",
          mediaType: "application/pdf",
          content: {
            kind: "url",
            url: "https://example.com/inspection-report.pdf",
          },
        },
      ],
    } satisfies SessionTimelineConversationMessage,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const attachment = canvas
      .getByText("inspection-report.pdf")
      .closest(".bg-background");

    await expect(attachment).toHaveClass("w-fit", "max-w-full");
    await expect(attachment?.parentElement?.parentElement).toHaveClass(
      "bg-muted",
    );
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
        { type: "data", value: { confidence: 0.9 } },
        { type: "custom", kind: "citation", value: { id: "doc-1" } },
      ],
    } satisfies SessionTimelineConversationMessage,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Reasoning")).toBeInTheDocument();
    await expect(canvas.queryByText("Think")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Reasoning" }));
    await expect(canvas.getByText("Think")).toBeVisible();
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
    } satisfies SessionTimelineConversationMessage,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvasElement).toHaveTextContent("javascript:alert(1)");
  },
});
