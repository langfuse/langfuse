import { Settings } from "lucide-react";
import { type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DropdownMenu } from "./DropdownMenu";

const items: ComponentProps<typeof DropdownMenu>["items"] = [
  {
    type: "item",
    id: "view-item",
    title: "View item",
    href: "/items/example",
    secondaryAction: {
      ariaLabel: "Configure item",
      href: "/items/example/settings",
      icon: Settings,
    },
  },
];

const meta = preview.meta({
  component: DropdownMenu,
  args: {
    children: () => null,
    items,
    title: "Actions",
  },
  render: (args) => (
    <DropdownMenu {...args}>
      {({ getTriggerProps }) => (
        <button type="button" {...getTriggerProps()}>
          Open menu
        </button>
      )}
    </DropdownMenu>
  ),
});

export const Default = meta.story({});

export const ManyItems = meta.story({
  args: {
    items: Array.from({ length: 20 }, (_, index) => ({
      type: "item" as const,
      id: `item-${index + 1}`,
      title: `Item ${index + 1}`,
      onClick: fn(),
    })),
  },
});

const getMenuActions = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  const trigger = canvas.getByRole("button", { name: "Open menu" });
  await userEvent.click(trigger);

  const menu = await body.findByRole("menu", { name: "Actions" });
  const menuItem = body.getByRole("menuitem", { name: /View item/ });
  const primaryAction = body.getByRole("link", { name: "View item" });
  const secondaryAction = body.getByRole("link", {
    name: "Configure item",
  });

  return { menu, menuItem, primaryAction, secondaryAction, trigger };
};

export const TestTriggerAndItems = meta.story({
  name: "(Test) Trigger and items",
  play: async ({ canvasElement }) => {
    const { menu, primaryAction, trigger } =
      await getMenuActions(canvasElement);

    await waitFor(() => expect(menu).toBeVisible());
    await expect(primaryAction).toHaveAttribute("href", "/items/example");
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await waitFor(() => {
      const menuRect = menu.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();

      expect(menuRect.left).toBeLessThan(triggerRect.right);
      expect(menuRect.right).toBeGreaterThan(triggerRect.left);
      expect(menuRect.top).toBeGreaterThan(triggerRect.bottom);
    });
  },
});

export const TestSecondaryActionLayout = meta.story({
  name: "(Test) Secondary action layout",
  play: async ({ canvasElement }) => {
    const { menuItem, secondaryAction } = await getMenuActions(canvasElement);

    await expect(menuItem).toContainElement(secondaryAction);

    const menuItemRect = menuItem.getBoundingClientRect();
    const secondaryActionRect = secondaryAction.getBoundingClientRect();
    const centerDifference = Math.abs(
      menuItemRect.top +
        menuItemRect.height / 2 -
        (secondaryActionRect.top + secondaryActionRect.height / 2),
    );
    await expect(centerDifference).toBeLessThanOrEqual(1);

    await userEvent.hover(secondaryAction);
    await waitFor(() => expect(menuItem).toHaveAttribute("data-active"));
  },
});

export const TestActionsRemainIndependent = meta.story({
  name: "(Test) Actions remain independent",
  play: async ({ canvasElement }) => {
    const { primaryAction, secondaryAction } =
      await getMenuActions(canvasElement);
    const onPrimaryClick = fn((event: MouseEvent) => event.preventDefault());
    const onSecondaryClick = fn((event: MouseEvent) => event.preventDefault());
    primaryAction.addEventListener("click", onPrimaryClick);
    secondaryAction.addEventListener("click", onSecondaryClick);

    await userEvent.click(secondaryAction);

    await expect(onSecondaryClick).toHaveBeenCalledOnce();
    await expect(onPrimaryClick).not.toHaveBeenCalled();
  },
});

export const TestKeyboardActivation = meta.story({
  name: "(Test) Keyboard activation",
  play: async ({ canvasElement }) => {
    const firstOpen = await getMenuActions(canvasElement);
    const onPrimaryClick = fn((event: MouseEvent) => event.preventDefault());
    firstOpen.primaryAction.addEventListener("click", onPrimaryClick);

    firstOpen.menuItem.focus();
    await expect(firstOpen.menuItem).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    const secondOpen = await getMenuActions(canvasElement);
    secondOpen.primaryAction.addEventListener("click", onPrimaryClick);
    secondOpen.menuItem.focus();
    await expect(secondOpen.menuItem).toHaveFocus();
    await userEvent.keyboard(" ");

    await expect(onPrimaryClick).toHaveBeenCalledTimes(2);
  },
});

const onPrimaryAction = fn();
const onSecondaryAction = fn();

export const TestClickActions = meta.story({
  name: "(Test) Click actions",
  args: {
    items: [
      {
        type: "item",
        id: "action",
        title: "Run action",
        onClick: onPrimaryAction,
        secondaryAction: {
          ariaLabel: "Run secondary action",
          icon: Settings,
          onClick: onSecondaryAction,
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    onPrimaryAction.mockClear();
    onSecondaryAction.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Open menu" });

    await userEvent.click(trigger);
    await userEvent.click(
      body.getByRole("button", { name: "Run secondary action" }),
    );
    await expect(onSecondaryAction).toHaveBeenCalledOnce();
    await expect(onPrimaryAction).not.toHaveBeenCalled();

    await userEvent.click(trigger);
    await userEvent.click(body.getByRole("button", { name: "Run action" }));
    await expect(onPrimaryAction).toHaveBeenCalledOnce();
  },
});

const onDisabledAction = fn();

export const TestDisabledAction = meta.story({
  name: "(Test) Disabled action",
  args: {
    items: [
      {
        type: "item",
        id: "disabled",
        title: "Edit",
        disabled: { reason: "You don't have permission to edit this item." },
        onClick: onDisabledAction,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    onDisabledAction.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open menu" }));
    const menuItem = await body.findByRole("menuitem", { name: "Edit" });
    await expect(menuItem).toHaveAttribute("aria-disabled", "true");
    await expect(menuItem).toHaveAttribute(
      "title",
      "You don't have permission to edit this item.",
    );

    await userEvent.click(body.getByRole("button", { name: "Edit" }));
    await expect(onDisabledAction).not.toHaveBeenCalled();
  },
});
