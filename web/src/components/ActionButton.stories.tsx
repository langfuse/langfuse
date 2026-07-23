import { PlusIcon } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { ActionButton } from "./ActionButton";

const meta = preview.meta({
  component: ActionButton,
});

export const Default = meta.story({
  args: {
    children: "Create item",
    onClick: fn(),
  },
});

export const WithIcon = meta.story({
  args: {
    children: "Create item",
    icon: <PlusIcon className="h-4 w-4" aria-hidden="true" />,
    onClick: fn(),
  },
});

export const Link = meta.story({
  args: {
    children: "View details",
    href: "/",
    variant: "secondary",
  },
});

export const Loading = meta.story({
  args: {
    children: "Create item",
    loading: true,
  },
});

export const NoAccess = meta.story({
  args: {
    children: "Create item",
    hasAccess: false,
  },
});

export const NoEntitlement = meta.story({
  args: {
    children: "Create item",
    hasEntitlement: false,
  },
});

export const LimitReached = meta.story({
  args: {
    children: "Create item",
    limit: 3,
    limitValue: 3,
  },
});
