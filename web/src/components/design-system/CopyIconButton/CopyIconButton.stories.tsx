import { expect, fn, spyOn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { CopyIconButton } from "./CopyIconButton";

const meta = preview.meta({
  component: CopyIconButton,
  args: {
    value: "pk-lf-00000000-0000-0000-0000-000000000000",
    label: "Copy LANGFUSE_PUBLIC_KEY",
    onCopy: fn(),
  },
});

export const Default = meta.story({
  args: {
    size: "sm",
  },
});

export const WithCopiedMessage = meta.story({
  args: {
    label: "Copy .env",
    size: "sm",
    copiedMessage: "Secrets are not included, create a new key to copy them.",
  },
});

export const VariantMatrix = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-center gap-3">
      {(["xs", "sm", "md"] as const).map((size) => (
        <CopyIconButton
          key={size}
          label="Copy value"
          value="https://cloud.langfuse.com"
          size={size}
        />
      ))}
    </div>
  ),
});

export const CopiesAndConfirms = meta.story({
  name: "(Test) Copies and confirms once, keeping its name",
  args: {
    size: "sm",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy LANGFUSE_PUBLIC_KEY" }),
      );
      await expect(writeText).toHaveBeenCalledWith(args.value);
      await expect(args.onCopy).toHaveBeenCalledOnce();
      await expect(
        canvas.getByRole("button", { name: "Copy LANGFUSE_PUBLIC_KEY" }),
      ).toBeVisible();
      await expect(canvas.getAllByRole("status")).toHaveLength(1);
      await expect(canvas.getByRole("status")).toHaveTextContent("Copied");
    } finally {
      writeText.mockRestore();
    }
  },
});

export const SaysTheCopiedMessage = meta.story({
  name: "(Test) Shows and says the copied message",
  args: WithCopiedMessage.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const message = "Secrets are not included, create a new key to copy them.";
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Copy .env" }));
      await expect(canvas.getByRole("status")).toHaveTextContent(message);
      await expect(canvas.getByTitle(message)).toBeVisible();
    } finally {
      writeText.mockRestore();
    }
  },
});
