import React from "react";
import { ExternalLink, RefreshCw } from "@langfuse/icons";
import { expect, fn, spyOn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { CodeSection } from "./CodeSection";

type Variant = NonNullable<React.ComponentProps<typeof CodeSection>["variant"]>;

const variants = Object.keys({
  filled: true,
  outline: true,
  plain: true,
} satisfies Record<Variant, true>) as Variant[];

const envCode = `LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com"`;

const longCode = Array.from(
  { length: 14 },
  (_, index) =>
    `line ${index + 1}: const value${index + 1} = compute(${index + 1});`,
).join("\n");

const agentPrompt = [
  "Add Langfuse tracing to this application.",
  '1. Install the Langfuse skill: npx skills add langfuse/skills --skill "langfuse" (in Cursor: /add-plugin langfuse).',
  "2. The keys are already in .env: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL. Don't print, paste or commit them.",
  "3. Pick the integration that matches the stack (all of them are listed in https://langfuse.com/llms.txt).",
  "4. Run the app once so a trace is sent, fetch it back to check it, and tell me what you traced.",
].join("\n");

const longLine =
  "Authorization: Basic cGstbGYtMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwOnNrLWxmLTAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMA==";

const meta = preview.meta({
  component: CodeSection,
});

export const Default = meta.story({
  args: {
    title: ".env",
    content: envCode,
  },
});

export const Outline = meta.story({
  args: {
    title: "HF Space Host",
    variant: "outline",
    content: "https://huggingface.co/spaces/org/langfuse",
  },
});

export const Plain = meta.story({
  args: {
    title: "Python",
    variant: "plain",
    content: 'prompt = langfuse.get_prompt("movie-critic")',
  },
});

export const WithoutTitle = meta.story({
  args: {
    variant: "outline",
    content: "sk-lf-00000000-0000-0000-0000-000000000000",
  },
});

export const WithActions = meta.story({
  args: {
    title: "Webhook Secret",
    variant: "outline",
    content: "whsec_0000000000000000000000000000",
    actions: [
      { icon: RefreshCw, label: "Regenerate", onClick: () => {} },
      { icon: ExternalLink, label: "Open docs", onClick: () => {} },
    ],
  },
});

export const CustomBody = meta.story({
  args: {
    title: "Text Prompt",
    content: "Answer {{question}} using {{context}}.",
    children: (
      <>
        Answer <span className="text-primary-accent">{"{{question}}"}</span>{" "}
        using <span className="text-primary-accent">{"{{context}}"}</span>.
      </>
    ),
  },
});

export const Collapsible = meta.story({
  args: {
    title: "Text Prompt",
    isCollapsible: true,
    defaultCollapsed: true,
    content: longCode,
  },
});

export const WithCopiedMessage = meta.story({
  args: {
    title: ".env",
    content: envCode,
    copiedMessage: "Secrets are not included, create a new key to copy them.",
  },
});

export const WithCopyButton = meta.story({
  args: {
    title: "Paste this into your coding agent",
    content: agentPrompt,
    copyButton: { text: "Copy prompt", variant: "primary" },
    onCopy: fn(),
  },
});

export const Preview = meta.story({
  args: {
    title: "Paste this into your coding agent",
    content: agentPrompt,
    copyButton: { text: "Copy prompt", variant: "primary" },
    expandLabel: "Show the full prompt",
  },
});

export const LongLineWithoutWrap = meta.story({
  args: {
    variant: "outline",
    shouldWrapLines: false,
    content: longLine,
  },
});

export const VariantMatrix = meta.story({
  render: () => (
    <div className="grid gap-6">
      {variants.map((variant) => (
        <div key={variant} className="grid gap-4">
          <CodeSection
            title={variant}
            variant={variant}
            content={envCode}
            isCollapsible
          />
          <CodeSection variant={variant} content={envCode} />
        </div>
      ))}
    </div>
  ),
});

export const TogglesCollapse = meta.story({
  name: "(Test) Toggles Collapse",
  args: {
    title: "Text Prompt",
    isCollapsible: true,
    defaultCollapsed: true,
    content: longCode,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "Expand" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(
      canvas.getByRole("button", { name: "Collapse" }),
    ).toHaveAttribute("aria-expanded", "true");
  },
});

export const CopyButtonCopies = meta.story({
  name: "(Test) The copy button copies and calls onCopy",
  args: WithCopyButton.input.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy prompt" }),
      );
      await expect(writeText).toHaveBeenCalledWith(agentPrompt);
      await expect(args.onCopy).toHaveBeenCalledOnce();
      await expect(
        canvas.getByRole("button", { name: "Copied" }),
      ).toBeVisible();
    } finally {
      writeText.mockRestore();
    }
  },
});

export const PreviewExpands = meta.story({
  name: "(Test) The preview opens and closes",
  args: Preview.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "Show the full prompt" });
    const code = canvasElement.querySelector("code");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", code?.id);
    await userEvent.click(toggle);
    await expect(
      canvas.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
  },
});

export const CopiedMessageShows = meta.story({
  name: "(Test) The copy icon shows and says the copied message",
  args: WithCopiedMessage.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const message = "Secrets are not included, create a new key to copy them.";
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy to clipboard" }),
      );
      await expect(writeText).toHaveBeenCalledWith(envCode);
      await expect(canvas.getByRole("status")).toHaveTextContent(message);
      await expect(canvas.getByTitle(message)).toBeVisible();
    } finally {
      writeText.mockRestore();
    }
  },
});
