import preview from "../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { InAppAgentDetailLauncher } from "./InAppAgentDetailLauncher";
import { getInAppAgentFocusedQuickActions } from "@/src/features/in-app-agent/quickActions";

const quickActions = getInAppAgentFocusedQuickActions("trace") ?? [];

// The menu portals into the `popover` layer, outside the story canvas.
const overlay = () => within(document.body);

const meta = preview.meta({
  component: InAppAgentDetailLauncher,
  args: {
    isOpen: false,
    isDisabled: false,
    quickActions,
    onToggle: fn(),
    onSelectQuickAction: fn(),
  },
});

export const Default = meta.story({});

export const Open = meta.story({
  args: {
    isOpen: true,
  },
});

export const RunsQuickAction = meta.story({
  name: "(Test) Runs Quick Action",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Assistant quick actions" }),
    );

    const [firstAction] = args.quickActions;
    await userEvent.click(
      await overlay().findByRole("menuitem", {
        name: firstAction.label,
      }),
    );

    await expect(args.onSelectQuickAction).toHaveBeenCalledWith(firstAction, 0);
  },
});

export const BlockedWhileRunning = meta.story({
  name: "(Test) Blocked While Running",
  args: {
    isDisabled: true,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Assistant quick actions" }),
    );

    const [firstAction] = args.quickActions;
    const item = await overlay().findByRole("menuitem", {
      name: firstAction.label,
    });

    // Force past the pointer-events guard so this asserts the menu item really
    // refuses to dispatch, not just that it is styled unclickable.
    await userEvent.setup({ pointerEventsCheck: 0 }).click(item);
    await expect(args.onSelectQuickAction).not.toHaveBeenCalled();
  },
});
