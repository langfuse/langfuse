import preview from "../../../../.storybook/preview";
import { ActionButtonCountBadge } from "@/src/app/design-system/legacy-primitives/action-button-count-badge";

const meta = preview.meta({
  component: ActionButtonCountBadge,
  parameters: { a11y: { test: "error" } },
});

export default meta;

export const Default = meta.story({ args: { count: 3 } });

export const Overflow = meta.story({ args: { count: 120 } });
