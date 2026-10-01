import preview from "@/.storybook/preview";
import { expect, userEvent, within } from "storybook/test";

import { SessionTimelineContentMessage } from "@/src/features/sessions/SessionConversationTimeline/components/SessionTimelineContentMessage/SessionTimelineContentMessage";

const meta = preview.meta({
  component: SessionTimelineContentMessage,
  args: { senderName: undefined },
  parameters: { layout: "padded", a11y: { test: "error" } },
});

export default meta;

export const Assistant = meta.story({
  args: {
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "The normalized parser preserves **markdown**, structured data, and provider-independent message roles.",
      },
    ],
  },
});

export const NamedUser = meta.story({
  args: {
    role: "user",
    senderName: "Customer",
    parts: [
      {
        type: "text",
        text: "Find the latest documentation and summarize the relevant section.",
      },
    ],
  },
});

export const Tool = meta.story({
  args: {
    role: "tool",
    parts: [{ type: "text", text: "Tool response" }],
  },
});

export const StructuredData = meta.story({
  name: "(Test) Collapses JSON-only Message",
  args: {
    role: "tool",
    parts: [
      { type: "data", name: "confidence", value: 0.9 },
      { type: "custom", kind: "citation", value: 7 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", {
      name: "JSON-only message detected",
    });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryAllByRole("table")).toHaveLength(0);
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getAllByRole("table")).toHaveLength(2);
    await userEvent.click(toggle);
    await expect(canvas.queryAllByRole("table")).toHaveLength(0);
  },
});

export const MixedTextAndData = meta.story({
  name: "(Test) Keeps Mixed Message Expanded",
  args: {
    role: "assistant",
    parts: [
      { type: "text", text: "The structured result follows." },
      { type: "data", value: { confidence: 0.9 } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "JSON-only message detected" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText("The structured result follows."),
    ).toBeVisible();
    await expect(canvasElement).toHaveTextContent("confidence");
  },
});

export const Reasoning = meta.story({
  args: {
    role: "assistant",
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
  },
});

export const ReasoningData = meta.story({
  args: {
    role: "assistant",
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
  },
});

export const RedactedReasoning = meta.story({
  args: {
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        content: { kind: "redacted", data: "redacted-provider-payload" },
      },
      { type: "text", text: "Here is the result." },
    ],
  },
});

export const EncryptedReasoning = meta.story({
  args: {
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        content: { kind: "encrypted", data: "encrypted-provider-payload" },
      },
      { type: "text", text: "Here is the result." },
    ],
  },
});

export const EmbeddedImages = meta.story({
  args: {
    role: "user",
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
  },
});

export const FileAttachment = meta.story({
  name: "(Test) File Attachment Layout",
  args: {
    role: "user",
    parts: [
      { type: "text", text: "Here is the report from the inspection." },
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

export const RenderSupportedParts = meta.story({
  name: "(Test) Renders Supported Parts",
  parameters: { a11y: { test: "off" } },
  args: {
    role: "tool",
    parts: [
      { type: "reasoning", content: { kind: "text", text: "Think" } },
      { type: "data", value: { confidence: 0.9 } },
      { type: "custom", kind: "citation", value: { id: "doc-1" } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Reasoning")).toBeInTheDocument();
    await expect(canvas.queryByText("Think")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Reasoning" }));
    await expect(canvas.getByText("Think")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "JSON-only message detected" }),
    ).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      canvas.getByRole("button", { name: "JSON-only message detected" }),
    );
    await expect(canvasElement).toHaveTextContent("confidence");
    await expect(canvasElement).toHaveTextContent("citation");
  },
});

export const RejectUnsafeFileUrl = meta.story({
  name: "(Test) Rejects Unsafe File URL",
  parameters: { a11y: { test: "off" } },
  args: {
    role: "assistant",
    parts: [
      {
        type: "file",
        content: { kind: "url", url: "javascript:alert(1)" },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvasElement).toHaveTextContent("javascript:alert(1)");
  },
});
