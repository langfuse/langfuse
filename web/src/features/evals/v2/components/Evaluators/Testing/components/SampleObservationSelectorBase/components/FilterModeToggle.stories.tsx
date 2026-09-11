import { fn } from "storybook/test";

import preview from "../../../../../../../../../../.storybook/preview";
import { FilterModeToggle } from "./FilterModeToggle";

const meta = preview.meta({ component: FilterModeToggle });

export const Query = meta.story({
  args: {
    mode: "query",
    onChange: fn(),
  },
});

export const Builder = meta.story({
  args: {
    mode: "builder",
    onChange: fn(),
  },
});
