import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { MetricsFilterBuilder } from "./MetricsFilterBuilder";

const meta = preview.meta({ component: MetricsFilterBuilder });

export const Empty = meta.story({
  args: {
    view: "observations",
    columns: [
      {
        name: "Environment",
        id: "environment",
        type: "string",
        internal: "internalValue",
      },
    ],
    columnsWithCustomSelect: [],
    filters: [],
    onChange: fn(),
  },
});
