import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { SessionViewTabs } from "./SessionViewTabs";

const meta = preview.meta({
  component: SessionViewTabs,
  args: {
    value: "messages",
    hasUnsavedView: false,
    isMessagesPinned: true,
    savedViews: [{ id: "saved", name: "Generations", canEdit: true }],
    canManageViews: true,
    onManageViews: fn(),
    onUnpin: fn(),
    onRemoveUnsaved: fn(),
    onSaveUnsaved: fn(),
    onEditUnsaved: fn(),
    onValueChange: fn(),
    onCreate: fn(),
    onViewAction: fn(),
  },
});

export default meta;

export const DefaultPin = meta.story({
  name: "(Test) Pin by default",
  args: { onSetDefaultPin: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(canvas.getByRole("tab", { name: "Generations" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Generations options" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Pin by default" }),
    );
    await expect(args.onSetDefaultPin).toHaveBeenCalledWith("saved", true);
  },
});

export const DraftActions = meta.story({
  name: "(Test) Draft actions",
  args: { value: "unsaved", hasUnsavedView: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(canvas.getByRole("tab", { name: "Unsaved view" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Unsaved view options" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Save" }));
    await expect(args.onSaveUnsaved).toHaveBeenCalledOnce();
    await expect(args.onRemoveUnsaved).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Unsaved view options" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Discard" }),
    );
    await expect(args.onRemoveUnsaved).toHaveBeenCalledOnce();
    await expect(args.onUnpin).not.toHaveBeenCalled();
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
});

export const SavedActions = meta.story({
  name: "(Test) Saved actions",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    for (const action of ["edit", "duplicate", "delete"] as const) {
      await userEvent.hover(canvas.getByRole("tab", { name: "Generations" }));
      await userEvent.click(
        canvas.getByRole("button", { name: "Generations options" }),
      );
      await userEvent.click(
        await body.findByRole("menuitem", {
          name: new RegExp(`^${action}$`, "i"),
        }),
      );
      await expect(args.onViewAction).toHaveBeenLastCalledWith("saved", action);
    }
    await userEvent.hover(canvas.getByRole("tab", { name: "Generations" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Generations options" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Unpin" }));
    await expect(args.onUnpin).toHaveBeenCalledWith("saved");
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
});

export const MessagesAndToolbar = meta.story({
  name: "(Test) Messages and toolbar",
  args: { savedViews: [] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(canvas.getByRole("tab", { name: "Messages" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Messages options" }),
    );
    await body.findByRole("menuitem", { name: "Unpin" });
    await expect(
      body.queryByRole("menuitem", { name: "Edit" }),
    ).not.toBeInTheDocument();
    await expect(
      body.queryByRole("menuitem", { name: "Delete" }),
    ).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("menuitem", { name: "Duplicate" }));
    await expect(args.onViewAction).toHaveBeenCalledWith(
      "messages",
      "duplicate",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Messages options" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Unpin" }));
    await expect(args.onUnpin).toHaveBeenCalledWith("messages");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create custom view" }),
    );
    await expect(args.onCreate).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Manage views" }));
    await expect(args.onManageViews).toHaveBeenCalledOnce();
  },
});

export const NonEditableView = meta.story({
  name: "(Test) Non-editable view",
  args: { savedViews: [{ id: "saved", name: "Generations", canEdit: false }] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(canvas.getByRole("tab", { name: "Generations" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Generations options" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Edit" }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      body.getByRole("menuitem", { name: "Delete" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(body.getByRole("menuitem", { name: "Duplicate" }));
    await expect(args.onViewAction).toHaveBeenCalledWith("saved", "duplicate");
  },
});

export const ReadOnly = meta.story({
  name: "(Test) Read only",
  args: { canManageViews: false, hasUnsavedView: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(canvas.getByRole("tab", { name: "Generations" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Generations options" }),
    );
    await body.findByRole("menuitem", { name: "Unpin" });
    await expect(body.getAllByRole("menuitem")).toHaveLength(1);
    await userEvent.click(body.getByRole("menuitem", { name: "Unpin" }));
    await expect(args.onUnpin).toHaveBeenCalledWith("saved");
    await userEvent.hover(canvas.getByRole("tab", { name: "Unsaved view" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Unsaved view options" }),
    );
    await body.findByRole("menuitem", { name: "Discard" });
    await expect(
      body.queryByRole("menuitem", { name: "Save" }),
    ).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("menuitem", { name: "Discard" }));
    await expect(args.onRemoveUnsaved).toHaveBeenCalledOnce();
    await expect(args.onSaveUnsaved).not.toHaveBeenCalled();
    await expect(args.onViewAction).not.toHaveBeenCalled();
  },
});
