import React from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

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

export const RenderedContent = meta.story({
  args: {
    title: "Text Prompt",
    content: "Answer {{question}} using {{context}}.",
    renderedContent: (
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
