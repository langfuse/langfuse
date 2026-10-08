import preview from "@/.storybook/preview";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { SessionTimelineContentMessage } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineContentMessage/SessionTimelineContentMessage";

const meta = preview.meta({
  component: SessionTimelineContentMessage,
  args: { senderName: undefined },
  parameters: { layout: "padded", a11y: { test: "error" } },
});

export default meta;

export const TallPlainText = meta.story({
  args: {
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "A long plain text paragraph that wraps across multiple lines. ".repeat(
          250,
        ),
      },
    ],
    onOpenObservation: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button", { name: "Show more" });
    const content = canvasElement.ownerDocument.getElementById(
      toggle.getAttribute("aria-controls") ?? "",
    );
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(content).toHaveClass("max-h-96");
    await userEvent.click(toggle);
    await expect(
      canvas.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(content).not.toHaveClass("max-h-96");
    await userEvent.click(canvas.getByRole("button", { name: "Show less" }));
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.getByRole("button", { name: "Open observation" }),
    ).toBeInTheDocument();
  },
});

export const TallMarkdown = meta.story({
  args: {
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "## Heading\n\nA **formatted** paragraph.\n\n".repeat(40),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button", { name: "Show more" });
    const content = canvasElement.ownerDocument.getElementById(
      toggle.getAttribute("aria-controls") ?? "",
    );
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(content).toHaveClass("max-h-96");
    await userEvent.click(toggle);
    await expect(
      canvas.getAllByRole("heading", { name: "Heading" }),
    ).toHaveLength(40);
    await expect(
      canvas.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(content).not.toHaveClass("max-h-96");
    await userEvent.click(canvas.getByRole("button", { name: "Show less" }));
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(content).toHaveClass("max-h-96");
  },
});

export const ResponsiveMessage = meta.story({
  name: "(Test) Rechecks Preview Height on Resize",
  args: {
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "A paragraph that wraps as the available width changes. ".repeat(
          12,
        ),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const originalWidth = canvasElement.style.width;
    try {
      canvasElement.style.width = "800px";
      await waitFor(() =>
        expect(
          canvas.queryByRole("button", { name: "Show more" }),
        ).not.toBeInTheDocument(),
      );
      canvasElement.style.width = "200px";
      await expect(
        await canvas.findByRole("button", { name: "Show more" }),
      ).toHaveAttribute("aria-expanded", "false");
      canvasElement.style.width = "800px";
      await waitFor(() =>
        expect(
          canvas.queryByRole("button", { name: "Show more" }),
        ).not.toBeInTheDocument(),
      );
    } finally {
      canvasElement.style.width = originalWidth;
    }
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
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
    await expect(canvas.queryByText("0.9")).not.toBeInTheDocument();
    await expect(canvas.queryByText("7")).not.toBeInTheDocument();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getAllByText("0.9").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("7").length).toBeGreaterThan(0);
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByText("0.9")).not.toBeInTheDocument();
    await expect(canvas.queryByText("7")).not.toBeInTheDocument();
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
  name: "(Test) Safe File Attachment Link",
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
    await expect(canvas.getByText("inspection-report.pdf")).toBeVisible();
    const link = canvas.getByRole("link", {
      name: "https://example.com/inspection-report.pdf",
    });
    await expect(link).toHaveAttribute(
      "href",
      "https://example.com/inspection-report.pdf",
    );
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
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
