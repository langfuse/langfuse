import { Plus } from "lucide-react";

import preview from "@/.storybook/preview";
import { ModernSessionHeaderPill } from "@/src/features/sessions/ModernSessionHeaderPill";

const meta = preview.meta({
  component: ModernSessionHeaderPill,
  parameters: { a11y: { test: "error" } },
});

export default meta;

export const Display = meta.story({
  args: {
    variant: "display",
    children: "cost $0.084",
  },
});

export const Link = meta.story({
  args: {
    variant: "link",
    href: "/project/project-1/users/customer@example.com",
    children: "user customer@example.com",
  },
});

export const Button = meta.story({
  args: {
    variant: "button",
    ariaLabel: "Add metadata JSONPath",
    children: <Plus className="h-3 w-3" />,
  },
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <ModernSessionHeaderPill variant="display">
        tokens 18k → 6k (Σ 25k)
      </ModernSessionHeaderPill>
      <ModernSessionHeaderPill variant="display">
        env production
      </ModernSessionHeaderPill>
      <ModernSessionHeaderPill
        variant="link"
        href="/project/project-1/users/customer@example.com"
      >
        user customer@example.com
      </ModernSessionHeaderPill>
      <ModernSessionHeaderPill
        variant="button"
        ariaLabel="Add metadata JSONPath"
      >
        <Plus className="h-3 w-3" />
      </ModernSessionHeaderPill>
    </div>
  ),
});
