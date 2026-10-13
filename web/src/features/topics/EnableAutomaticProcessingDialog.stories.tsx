import * as DialogPrimitive from "@radix-ui/react-dialog";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { EnableAutomaticProcessingDialog } from "./EnableAutomaticProcessingDialog";

const models = {
  summary: "us.openai.gpt-6-luna",
  embedding: "us.cohere.embed-v4:0",
  clustering: "us.openai.gpt-5.6-terra",
};

const meta = preview.meta({
  component: EnableAutomaticProcessingDialog,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <DialogPrimitive.Root open>
        <Story />
      </DialogPrimitive.Root>
    ),
  ],
  args: {
    mode: "enable" as const,
    initialSampling: 1,
    traceIdleMs: 600_000,
    models,
    paused: null,
    saving: false,
    error: null,
    onSubmit: fn(),
  },
});

export default meta;

export const Enable = meta.story({});

export const EditSampling = meta.story({
  args: { mode: "edit" as const, initialSampling: 0.25 },
});

export const Paused = meta.story({
  args: {
    paused: {
      shortLabel: "LLM connection authentication failed",
      message:
        'The facet summaries model us.openai.gpt-6-luna on LLM connection "Amazon Bedrock" failed (HTTP 401). Check the connection\'s credentials, the model ID, and provider availability. Automatic processing was paused. Fix the connection, then turn automatic processing back on.',
    },
  },
});

export const MissingModel = meta.story({
  name: "(Test) A deleted connection blocks turning on",
  args: {
    models: { ...models, clustering: null },
    paused: {
      shortLabel: "LLM connection missing",
      message:
        'The LLM connection "Amazon Bedrock" was deleted. Choose another connection in Configure Topics, then turn automatic processing back on.',
    },
  },
  play: async () => {
    const body = within(document.body);
    await expect(await body.findByText("Not set")).toBeInTheDocument();
    await expect(body.getByRole("button", { name: "Turn on" })).toBeDisabled();
  },
});

export const SubmitsSampling = meta.story({
  name: "(Test) Turn on sends the chosen sampling rate",
  args: { initialSampling: 0.25 },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(body.getByRole("button", { name: "Turn on" }));
    await expect(args.onSubmit).toHaveBeenCalledWith(0.25);
  },
});
