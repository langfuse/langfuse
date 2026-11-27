import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { ComponentProps } from "react";
import { ConfigureTopicsDialog } from "./ConfigureTopicsDialog";

type ConfigureTopicsDraft = ComponentProps<
  typeof ConfigureTopicsDialog
>["draft"];

const providerGroups: Array<[string, string[]]> = [
  [
    "Amazon Bedrock",
    ["us.openai.gpt-6-luna", "us.cohere.embed-v4:0", "us.openai.gpt-5.6-terra"],
  ],
  ["OpenAI", ["gpt-6-luna", "text-embedding-3-small", "gpt-5.6-terra"]],
  ["Anthropic", ["claude-sonnet-4-5"]],
];

const emptyDraft = {
  summary: null,
  embedding: null,
  embeddingDimensions: "1024",
  clustering: null,
  idleSeconds: "600",
  hasEmbeddings: false,
  automaticProcessing: false,
} satisfies ConfigureTopicsDraft;

const filledDraft = {
  summary: { provider: "Amazon Bedrock", model: "us.openai.gpt-6-luna" },
  embedding: { provider: "Amazon Bedrock", model: "us.cohere.embed-v4:0" },
  embeddingDimensions: "1024",
  clustering: { provider: "Amazon Bedrock", model: "us.openai.gpt-5.6-terra" },
  idleSeconds: "600",
  hasEmbeddings: true,
  automaticProcessing: true,
} satisfies ConfigureTopicsDraft;

const meta = preview.meta({
  component: ConfigureTopicsDialog,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <DialogController<null>
        initialState={() => null}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
  args: {
    providerGroups,
    closeDialog: fn(),
    onConfigureProviders: fn(),
    onSave: fn(),
  },
});

export const NeedsSetup = meta.story({
  args: {
    draft: emptyDraft,
    notice: "none",
  },
});

export const Configured = meta.story({
  args: {
    draft: filledDraft,
    notice: "none",
  },
});

export const LockedEmbeddingExplainsWhy = meta.story({
  name: "(Test) Changing an embedded model explains the lock and blocks Save",
  args: {
    draft: filledDraft,
    notice: "none",
  },
  play: async () => {
    const body = within(document.body);
    const warning = /can't change once summaries are embedded/;
    const save = body.getByRole("button", { name: "Save" });
    await expect(body.queryByText(warning)).not.toBeInTheDocument();
    const dimensions = body.getByRole("spinbutton", {
      name: "Embedding dimensions",
    });
    await userEvent.clear(dimensions);
    await userEvent.type(dimensions, "512");
    await expect(body.getByText(warning)).toBeVisible();
    await expect(save).toBeDisabled();
    await userEvent.clear(dimensions);
    await userEvent.type(dimensions, "1024");
    await expect(body.queryByText(warning)).not.toBeInTheDocument();
    await expect(save).toBeEnabled();
  },
});

export const SavesTheSheet = meta.story({
  name: "(Test) Save sends models and idle time",
  args: {
    draft: filledDraft,
    notice: "none",
  },
  play: async ({ args }) => {
    const body = within(document.body);
    const idle = body.getByRole("spinbutton", {
      name: "Seconds to wait after the last observation",
    });
    await userEvent.clear(idle);
    await userEvent.type(idle, "90");
    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        idleSeconds: "90",
        clustering: filledDraft.clustering,
      }),
    );
  },
});

export const Paused = meta.story({
  args: {
    draft: { ...filledDraft, automaticProcessing: false },
    notice: "paused",
    shortLabel: "LLM connection missing",
    pausedAgo: "3 days ago",
    message:
      'The LLM connection "Amazon Bedrock" was deleted. Choose another connection in Configure Topics, then turn automatic processing back on.',
  },
});

export const SavesTurnedOffWithoutModelTests = meta.story({
  name: "(Test) Save with automatic processing off ignores failing unchanged models",
  args: {
    draft: { ...filledDraft, automaticProcessing: false },
    notice: "none",
    slotChecks: {
      summary: { status: "ok" },
      embedding: { status: "ok" },
      clustering: { status: "error", message: "Invalid API key." },
    },
  },
  play: async ({ args }) => {
    const body = within(document.body);
    const save = body.getByRole("button", { name: "Save" });
    await expect(save).toBeEnabled();
    await userEvent.click(save);
    await expect(args.onSave).toHaveBeenCalledOnce();
  },
});

export const BlocksSaveWhileRunningWithFailingModel = meta.story({
  name: "(Test) Save with automatic processing on needs every model to pass",
  args: {
    draft: filledDraft,
    notice: "none",
    slotChecks: {
      summary: { status: "ok" },
      embedding: { status: "ok" },
      clustering: { status: "error", message: "Invalid API key." },
    },
  },
  play: async () => {
    const body = within(document.body);
    await expect(body.getByRole("button", { name: "Save" })).toBeDisabled();
  },
});
