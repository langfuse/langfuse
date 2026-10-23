import { expect, fn, spyOn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { CopyList } from "./CopyList";

const secretKey = "sk-lf-00000000-0000-0000-0000-000000001234";

const meta = preview.meta({
  component: CopyList,
  args: {
    labelledBy: "copy-list-heading",
    onCopy: fn(),
    items: [
      { label: "LANGFUSE_SECRET_KEY", value: secretKey },
      {
        label: "LANGFUSE_PUBLIC_KEY",
        value: "pk-lf-00000000-0000-0000-0000-000000000000",
      },
      { label: "LANGFUSE_BASE_URL", value: "https://cloud.langfuse.com" },
    ],
  },
});

export const Default = meta.story({
  // The list takes its name from a heading the caller renders.
  render: (args) => (
    <div className="grid gap-2">
      <h3 id={args.labelledBy} className="text-sm font-bold">
        Your .env
      </h3>
      <CopyList {...args} />
    </div>
  ),
});

export const Masked = meta.story({
  render: Default.input.render,
  args: {
    items: [
      {
        label: "LANGFUSE_SECRET_KEY",
        value: secretKey,
        displayValue: "sk-lf-0000••••••••1234",
      },
      {
        label: "LANGFUSE_PUBLIC_KEY",
        value: "pk-lf-00000000-0000-0000-0000-000000000000",
      },
      { label: "LANGFUSE_BASE_URL", value: "https://cloud.langfuse.com" },
    ],
  },
});

export const CopiesTheRealValue = meta.story({
  name: "(Test) Copies the real value behind a masked one",
  render: Default.input.render,
  args: Masked.input.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await expect(canvas.queryByText(secretKey)).toBeNull();
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy LANGFUSE_SECRET_KEY" }),
      );
      await expect(writeText).toHaveBeenCalledWith(secretKey);
      await expect(args.onCopy).toHaveBeenCalledWith("LANGFUSE_SECRET_KEY");
    } finally {
      writeText.mockRestore();
    }
  },
});
