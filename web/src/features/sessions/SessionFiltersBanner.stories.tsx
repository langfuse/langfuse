import preview from "@/.storybook/preview";
import { fn } from "storybook/test";
import { SessionFiltersBanner } from "./SessionFiltersBanner";

const meta = preview.meta({
  component: SessionFiltersBanner,
  args: { onEdit: fn(), onClear: fn() },
});

export const Default = meta.story({});
