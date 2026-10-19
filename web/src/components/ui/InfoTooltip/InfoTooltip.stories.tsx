import preview from "../../../../.storybook/preview";
import { InfoTooltip } from "./InfoTooltip";

const meta = preview.meta({ component: InfoTooltip });

export const Default = meta.story({
  args: {
    label: "About evaluator names",
    children: "The evaluator name is also used as the score name.",
  },
});
