import preview from "@/.storybook/preview";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { SessionTimelineContentMessage } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineContentMessage/SessionTimelineContentMessage";

const meta = preview.meta({
  component: SessionTimelineContentMessage,
  args: { senderName: undefined },
  parameters: { layout: "padded", a11y: { test: "error" } },
});

export default meta;

export const ReasoningActions = meta.story({
  name: "(Test) Reasoning Actions At Every Position",
  args: {
    role: "assistant",
    onOpenObservation: fn(),
    parts: [
      { type: "reasoning", content: { kind: "text", text: "Before content" } },
      {
        type: "reasoning",
        content: { kind: "encrypted", data: "encrypted-before" },
      },
      { type: "text", text: "The answer" },
      { type: "reasoning", content: { kind: "text", text: "After content" } },
      {
        type: "reasoning",
        content: { kind: "encrypted", data: "encrypted-after" },
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const rows = canvasElement.querySelectorAll("section");
    await expect(rows).toHaveLength(4);
    for (const row of rows) {
      const header = row.firstElementChild!;
      const action = within(row).getByText("Open generation", {
        selector: "button",
      });
      const divider = header.querySelector(
        '[aria-hidden="true"].border-dashed',
      )!;
      await expect(divider).toBeInTheDocument();
      await expect(action).toHaveClass("group-hover/collapsible-row:visible");
      const trigger = within(row).queryByRole("button", { name: "Reasoning" });
      if (trigger) {
        await userEvent.click(trigger);
        await expect(trigger).toHaveFocus();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(action).toBeVisible();
        await expect(divider).toBeVisible();
      }
      await userEvent.click(action);
    }
    await expect(args.onOpenObservation).toHaveBeenCalledTimes(4);
    await expect(
      canvas.queryByRole("button", { name: "Expand Encrypted reasoning" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Before content")).toBeVisible();
    await expect(canvas.getByText("After content")).toBeVisible();
  },
});

export const AccessibleCollapsedPreview = meta.story({
  name: "(Test) Accessible Collapsed Preview",
  args: {
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `[Visible link](https://example.com/preview)\n\n${"A long paragraph that makes this message taller than the preview.\n\n".repeat(80)}[Clipped link](https://example.com/end)`,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button", { name: "Show more" });
    const visibleLink = canvas.getByRole("link", { name: "Visible link" });
    const preventNavigation = fn((event: Event) => event.preventDefault());
    visibleLink.addEventListener("click", preventNavigation);
    try {
      await userEvent.click(visibleLink);
      await expect(preventNavigation).toHaveBeenCalled();
      await expect(visibleLink).toHaveFocus();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await userEvent.tab();
      await expect(
        canvas.getByRole("link", { name: "Clipped link" }),
      ).toHaveFocus();
      await expect(
        canvas.getByRole("button", { name: "Show less" }),
      ).toHaveAttribute("aria-expanded", "true");
    } finally {
      visibleLink.removeEventListener("click", preventNavigation);
    }
  },
});

export const TallPlainText = meta.story({
  name: "(Test) Tall Plain Text",
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
  name: "(Test) Tall Markdown",
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
  name: "(Test) Named User",
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

const s3ImageUri = "s3://customer-bucket/media/photo.jpeg";

export const S3ImageFile = meta.story({
  name: "(Test) S3 Image Uses Media Reference",
  parameters: { a11y: { test: "off" } },
  args: {
    role: "user",
    parts: [
      { type: "text", text: "Show this S3 image." },
      {
        type: "file",
        mediaType: "image/jpeg",
        content: { kind: "url", url: s3ImageUri },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      const mediaTag = canvas.queryByRole("button", { name: "JPEG media" });
      const disabledFeatureFallback = canvas.queryByText(s3ImageUri);
      expect(mediaTag ?? disabledFeatureFallback).not.toBeNull();
    });
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
  },
});

export const NarrowUnresolvedImageLayout = meta.story({
  name: "(Test) Narrow unresolved image layout",
  parameters: { a11y: { test: "off" } },
  args: {
    role: "user",
    parts: [
      { type: "text", text: "Show this unresolved image." },
      {
        type: "file",
        mediaType: "image/*",
        content: { kind: "base64", data: "A".repeat(800) },
      },
    ],
    timestamp: new Date("2026-10-09T11:45:47.000Z"),
    onOpenObservation: fn(),
  },
  render: (args) => (
    <div data-testid="narrow-session-message" className="w-[241px]">
      <SessionTimelineContentMessage {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const composition = canvas.getByTestId("narrow-session-message");
    const article = composition.querySelector<HTMLElement>("article");
    const fileTitle =
      article?.querySelector<HTMLElement>("div.font-bold") ?? null;
    const fileCard = fileTitle?.parentElement ?? null;
    const table = fileCard?.querySelector<HTMLTableElement>("table");

    await expect(article).not.toBeNull();
    await expect(fileTitle).not.toBeNull();
    await expect(fileCard).not.toBeNull();
    await expect(table).not.toBeNull();

    if (!article || !fileCard || !table || !fileCard.parentElement) return;

    const fileBounds = fileCard.getBoundingClientRect();
    const availableBounds = fileCard.parentElement.getBoundingClientRect();
    const tableBounds = table.getBoundingClientRect();

    await expect(
      Math.abs(fileBounds.width - availableBounds.width),
    ).toBeLessThan(1);
    await expect(tableBounds.width).toBeGreaterThan(120);
    await expect(fileCard.scrollWidth).toBeLessThanOrEqual(
      fileCard.clientWidth,
    );
    await expect(table.scrollWidth).toBeLessThanOrEqual(table.clientWidth);
  },
});
