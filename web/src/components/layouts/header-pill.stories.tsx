import { expect, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import {
  HeaderPill,
  HeaderPillDot,
  HeaderPillValue,
} from "@/src/components/layouts/header-pill";

const meta = preview.meta({
  component: HeaderPill,
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    nextjs: {
      router: {
        asPath: "/project/project-1/users/ada@example.com",
      },
    },
  },
});

export default meta;

export const Display = meta.story({
  args: {
    variant: "display",
    children: (
      <>
        cost <HeaderPillValue>$3.841</HeaderPillValue>
      </>
    ),
  },
});

export const DisplayWithDot = meta.story({
  args: {
    variant: "display",
    children: (
      <>
        <span>
          p50 <HeaderPillValue>1m 43s</HeaderPillValue>
        </span>
        <HeaderPillDot />
        <span>
          p95 <HeaderPillValue>5m 49s</HeaderPillValue>
        </span>
      </>
    ),
  },
});

export const Link = meta.story({
  args: {
    variant: "link",
    href: "/project/project-1/users/ada%40example.com",
    children: (
      <>
        user <HeaderPillValue>ada@example.com</HeaderPillValue>
      </>
    ),
  },
});

export const Button = meta.story({
  args: {
    variant: "button",
    ariaLabel: "Show 12 hidden trace details",
    children: "+12",
  },
});

export const VariantMatrix = meta.story({
  args: {
    variant: "display",
    children: "tokens",
  },
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <HeaderPill variant="display">
        env <HeaderPillValue>default</HeaderPillValue>
      </HeaderPill>
      <HeaderPill
        variant="link"
        href="/project/project-1/users/ada%40example.com"
      >
        user <HeaderPillValue>ada@example.com</HeaderPillValue>
      </HeaderPill>
      <HeaderPill variant="button" ariaLabel="Show hidden details">
        +4
      </HeaderPill>
    </div>
  ),
});

export const TestRendersDisplayValue = meta.story({
  name: "(Test) Renders display value",
  args: {
    variant: "display",
    title: "exact $3.841000",
    children: (
      <>
        cost <HeaderPillValue>$3.841</HeaderPillValue>
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvas.getByText("cost").closest("[data-header-pill]");
    await expect(pill).toHaveTextContent("cost $3.841");
    await expect(pill).toHaveAttribute("title", "exact $3.841000");
  },
});
