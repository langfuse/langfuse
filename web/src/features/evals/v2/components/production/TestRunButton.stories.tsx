import { fn } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { TestRunButton } from "./TestRunButton";

const meta = preview.meta({ component: TestRunButton });
export const Default = meta.story({
  args: { isPending: false, disabledReason: null, onRun: fn() },
});
export const Disabled = meta.story({
  args: {
    isPending: false,
    disabledReason: "Select a sample first",
    onRun: fn(),
  },
});
export const Running = meta.story({
  args: { isPending: true, disabledReason: null, onRun: fn() },
});
