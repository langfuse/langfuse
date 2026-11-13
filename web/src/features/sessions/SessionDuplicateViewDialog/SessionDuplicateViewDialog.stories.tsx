import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SessionDuplicateViewDialog } from "./SessionDuplicateViewDialog";

const meta = preview.meta({
  component: SessionDuplicateViewDialog,
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
    view: { id: "saved", name: "Generations" },
    canEdit: true,
    isPending: false,
    error: undefined,
    onSubmit:
      fn<(name: string) => Promise<void>>().mockResolvedValue(undefined),
  },
});
export default meta;

export const Duplicate = meta.story({
  name: "(Test) Duplicate",
  play: async ({ args }) => {
    const body = within(document.body);
    const input = body.getByRole("textbox", { name: "View name" });
    await expect(input).toHaveValue("Generations (copy)");
    await userEvent.clear(input);
    await expect(
      body.getByRole("button", { name: "Save view" }),
    ).toBeDisabled();
    await userEvent.type(input, "  New view  ");
    await userEvent.click(body.getByRole("button", { name: "Save view" }));
    await expect(args.onSubmit).toHaveBeenCalledWith("New view");
  },
});
export const ReadOnly = meta.story({
  args: {
    view: { id: "saved", name: "Generations" },
    canEdit: false,
  },
});
export const Pending = meta.story({ args: { isPending: true } });
export const Error = meta.story({
  args: { error: "Unable to save view. Try again." },
});
