import { expect, fn, spyOn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { CopyButton } from "./CopyButton";

const meta = preview.meta({
  component: CopyButton,
  args: {
    value: "pk-lf-00000000-0000-0000-0000-000000000000",
    onCopy: fn(),
  },
});

export const Default = meta.story({
  args: {
    text: "Copy .env",
    variant: "secondary",
    size: "sm",
  },
});

export const VariantMatrix = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(["primary", "secondary", "ghost"] as const).map((variant) =>
        (["default", "sm"] as const).map((size) => (
          <CopyButton
            key={`${variant}-${size}`}
            text="Copy prompt"
            value="Add Langfuse tracing to this application."
            variant={variant}
            size={size}
          />
        )),
      )}
    </div>
  ),
});

export const CopiesAndConfirms = meta.story({
  name: "(Test) Copies the value and confirms it once",
  args: {
    text: "Copy prompt",
    variant: "primary",
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
        canvas.getByRole("button", { name: "Copy prompt" }),
      );
      await expect(writeText).toHaveBeenCalledWith(args.value);
      await expect(args.onCopy).toHaveBeenCalledOnce();
      await expect(
        canvas.getByRole("button", { name: "Copied" }),
      ).toBeVisible();
      await expect(canvas.getAllByRole("status")).toHaveLength(1);
      await expect(canvas.getByRole("status")).toHaveTextContent("Copied");
    } finally {
      writeText.mockRestore();
    }
  },
});
