import preview from "../../../../../../../../../.storybook/preview";
import { RuleNameCell } from "./RuleNameCell";

const meta = preview.meta({ component: RuleNameCell });

export const Default = meta.story({
  args: { name: "Production quality checks", legacy: false },
});

export const Legacy = meta.story({
  args: { name: "Legacy trace evaluator", legacy: true },
});
