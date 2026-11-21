import preview from "@/.storybook/preview";
import { fn } from "storybook/test";
import { SessionFiltersBanner } from "./SessionFiltersBanner";

const meta = preview.meta({
  component: SessionFiltersBanner,
  args: {
    onEdit: fn(),
    onClear: fn(),
    message: "Filters are active. Some session data may be hidden.",
  },
});

export const Default = meta.story({ args: { onSave: fn() } });
