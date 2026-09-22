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
    await expect(body.queryByRole("menu", { name: "Actions" })).toBeNull();
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

export const TestDisabledLink = meta.story({
  name: "(Test) Disabled link",
  args: {
    items: [
      {
        type: "item",
        id: "disabled-link",
        title: "View item",
        disabled: { reason: "You don't have permission to view this item." },
        href: "/items/example",
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open menu" }));
    const link = await body.findByRole("link", { name: "View item" });
    await expect(link).toHaveAttribute("aria-disabled", "true");
    await expect(link).toHaveAttribute("tabindex", "-1");
  },
});

const onCheckboxChange = fn();
const onNestedAction = fn();

export const TestCheckboxAndSubmenu = meta.story({
  name: "(Test) Checkbox and submenu",
  args: {
    items: [
      {
        type: "checkbox",
        id: "include-output",
        title: "Include output",
        checked: false,
        onCheckedChange: onCheckboxChange,
      },
      {
        type: "submenu",
        id: "destinations",
        title: "Destinations",
        search: { placeholder: "Search destinations…" },
        items: [
          {
            type: "item",
            id: "dataset",
            title: "Dataset",
            onClick: onNestedAction,
          },
          {
            type: "item",
            id: "playground",
            title: "Playground",
            onClick: fn(),
          },
        ],
      },
      {
        type: "submenu",
        id: "unavailable",
        title: "Unavailable",
        disabled: { reason: "This submenu is unavailable." },
        items: [
          {
            type: "item",
            id: "hidden-item",
            title: "Hidden item",
            onClick: fn(),
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    onCheckboxChange.mockClear();
    onNestedAction.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    const trigger = canvas.getByRole("button", { name: "Open menu" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    const menu = await body.findByRole("menu", { name: "Actions" });
    const checkbox = body.getByRole("menuitemcheckbox", {
      name: "Include output",
    });
    await expect(checkbox).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(onCheckboxChange).toHaveBeenCalledWith(true);
    await userEvent.keyboard("{ArrowDown}");
    await expect(
      body.getByRole("menuitem", { name: "Destinations" }),
    ).toHaveFocus();
    await expect(menu).toBeVisible();

    await userEvent.hover(body.getByRole("menuitem", { name: "Destinations" }));
    const submenu = await body.findByRole("menu", { name: "Destinations" });
    await waitFor(() => expect(submenu).toBeVisible());
    await userEvent.type(
      body.getByRole("searchbox", { name: "Search destinations…" }),
      "data",
    );
    await userEvent.keyboard("{ArrowUp}");
    await expect(body.getByRole("menuitem", { name: "Dataset" })).toHaveFocus();
    await userEvent.click(body.getByRole("button", { name: "Dataset" }));
    await expect(onNestedAction).toHaveBeenCalledOnce();
    await expect(body.queryByRole("menu", { name: "Actions" })).toBeNull();

    await userEvent.click(trigger);
    await userEvent.hover(body.getByRole("menuitem", { name: "Destinations" }));
    await body.findByRole("menu", { name: "Destinations" });
    await userEvent.click(
      body.getByRole("searchbox", { name: "Search destinations…" }),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("menu", { name: "Destinations" })).toBeNull(),
    );

    await userEvent.hover(body.getByRole("menuitem", { name: "Unavailable" }));
    await expect(body.queryByRole("menu", { name: "Unavailable" })).toBeNull();
  },
});

export const TestNestedMenusStayWithinViewport = meta.story({
  name: "(Test) Nested menus stay within viewport",
  globals: { viewport: { value: "narrow", isRotated: false } },
  parameters: {
    viewport: {
      options: {
        narrow: {
          name: "Narrow phone",
          styles: { width: "320px", height: "640px" },
        },
      },
    },
  },
  args: {
    placement: "bottom-end",
    items: [
      {
        type: "item",
        id: "copy-observation",
        title: "Copy observation identifier",
        onClick: fn(),
      },
      {
        type: "submenu",
        id: "add-to",
        title: "Add to",
        items: [
          {
            type: "submenu",
            id: "datasets",
            title: "Datasets",
            search: { placeholder: "Search datasets…" },
            items: [
              {
                type: "item",
                id: "long-dataset",
                title:
                  "Customer support quality evaluation with additional reference answers",
                onClick: fn(),
              },
            ],
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    const body = within(document.body);
    const expectMenuWithinViewport = async (name: string) => {
      const menu = await body.findByRole("menu", { name });
      await waitFor(() => {
        const bounds = menu.getBoundingClientRect();
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(
          document.documentElement.clientWidth,
        );
      });
    };

    await userEvent.click(canvas.getByRole("button", { name: "Open menu" }));
    await expectMenuWithinViewport("Actions");
    await userEvent.click(body.getByRole("menuitem", { name: "Add to" }));
    await expectMenuWithinViewport("Add to");
    await userEvent.click(body.getByRole("menuitem", { name: "Datasets" }));
    await expectMenuWithinViewport("Datasets");
    const search = body.getByRole("searchbox", { name: "Search datasets…" });
    await userEvent.type(search, "quality");
    await expect(search).toHaveValue("quality");
    await expect(
      body.getByRole("menuitem", {
        name: "Customer support quality evaluation with additional reference answers",
      }),
    ).toBeVisible();
  },
});
