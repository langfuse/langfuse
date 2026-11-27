import { OpenOverlay } from "@/src/components/design-system/OpenOverlay/OpenOverlay";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { SessionDeleteViewDialog } from "./SessionDeleteViewDialog";

const meta = preview.meta({
  component: SessionDeleteViewDialog,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <OpenOverlay>
        <Story />
      </OpenOverlay>
    ),
  ],
  args: {
    view: { id: "saved", name: "Generations" },
    canEdit: true,
    isPending: false,
    error: undefined,
    onDelete: fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
});
export default meta;

export const Delete = meta.story({
  name: "(Test) Delete",
  play: async ({ args }) => {
    const body = within(document.body);
    await expect(body.queryByRole("textbox")).not.toBeInTheDocument();
    await expect(args.onDelete).not.toHaveBeenCalled();
    await userEvent.click(body.getByRole("button", { name: "Delete view" }));
    await expect(args.onDelete).toHaveBeenCalledWith();
  },
});
export const ProtectedMessages = meta.story({
  name: "(Test) Protected Messages",
  args: { view: { id: "messages", name: "Messages" } },
  play: async () => {
    await expect(
      within(document.body).getByRole("button", { name: "Delete view" }),
    ).toBeDisabled();
  },
});
export const ReadOnly = meta.story({
  args: { view: { id: "saved", name: "Generations" }, canEdit: false },
});
export const Pending = meta.story({
  args: { view: { id: "saved", name: "Generations" }, isPending: true },
});
export const Error = meta.story({
  args: { error: "Unable to delete view. Try again." },
});
