import React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Settings } from "@langfuse/icons";

import preview from "../../../../.storybook/preview";
import { Banner } from "./Banner";

type Variant = NonNullable<React.ComponentProps<typeof Banner>["variant"]>;

const meta = preview.meta({
  component: Banner,
});

const variants = Object.keys({
  neutral: true,
  info: true,
  success: true,
  warning: true,
  error: true,
} satisfies Record<Variant, true>) as Variant[];

export const Default = meta.story({
  args: {
    title: "Access denied",
    children:
      "Only organization owners can redeem coupons. Ask an owner of this organization to open this page.",
  },
});

export const Info = meta.story({
  args: {
    variant: "info",
    title: "Upgrade to a paid plan first",
    children:
      "Credits are applied to a paid subscription. Choose a plan in the billing settings, then come back to this page to redeem your coupon.",
  },
});

export const MessageOnly = meta.story({
  args: {
    variant: "error",
    children: "Map could not load: request timed out",
  },
});

export const WithActions = meta.story({
  args: {
    variant: "warning",
    title: "Automatic Topics processing is paused",
    children: "Processing stopped after the monthly budget was reached.",
    actions: [
      { text: "Turn back on", onClick: fn() },
      { text: "Keep off", onClick: fn() },
    ],
  },
});

export const WithLink = meta.story({
  args: {
    variant: "info",
    title: "Upgrade to a paid plan first",
    children:
      "Credits are applied to a paid subscription. Choose a plan in the billing settings, then come back to this page to redeem your coupon.",
    actions: [{ text: "Open billing settings", href: "#" }],
  },
});

export const ShortMessageWithAction = meta.story({
  args: {
    children: "2 nested threads are hidden.",
    actions: [{ text: "Show nested threads", onClick: fn() }],
  },
});

export const LinkActions = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="grid w-[600px] gap-4">
      <Banner
        title="In-app link"
        actions={[{ text: "Open billing settings", href: "#" }]}
      >
        Stays in the same tab, so it has no icon.
      </Banner>
      <Banner
        title="External link"
        actions={[{ text: "Read the docs", href: "https://langfuse.com/docs" }]}
      >
        Opens a new tab. Banner adds the icon.
      </Banner>
      <Banner
        title="External link with an icon passed"
        actions={[
          {
            text: "Read the docs",
            href: "https://langfuse.com/docs",
            icon: Settings,
          },
        ]}
      >
        The external link icon replaces the passed icon.
      </Banner>
    </div>
  ),
});

export const Dismissible = meta.story({
  args: {
    variant: "success",
    title: "Model matched",
    children: "Requests for this model now use the price you added.",
    onDismiss: fn(),
  },
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="grid w-[600px] gap-4">
      {variants.map((variant) => (
        <Banner
          key={variant}
          variant={variant}
          title={variant}
          actions={[{ text: "Action", onClick: () => undefined }]}
        >
          One layout for every status: icon, optional title, message, optional
          actions.
        </Banner>
      ))}
    </div>
  ),
});

export const DismissAction = meta.story({
  name: "(Test) Dismiss Action",
  args: {
    variant: "warning",
    title: "Review required",
    children: "Check this warning before continuing.",
    onDismiss: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(args.onDismiss).toHaveBeenCalledOnce();
  },
});
