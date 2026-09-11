import preview from "../../../.storybook/preview";
import { fn } from "storybook/test";
import { ColumnVisibilityHeader } from "./ColumnVisibilityHeader";

const meta = preview.meta({ component: ColumnVisibilityHeader });

export const Default = meta.story({
  args: { onRestoreDefaults: fn() },
});
