import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { AutomaticProcessingControl } from "./AutomaticProcessingControl";
import {
  prepareAutomaticProcessingAction,
  type AutomaticProcessingState,
} from "./prepare-topics-actions";

const meta = preview.meta({
  component: AutomaticProcessingControl,
  parameters: { layout: "centered" },
});

const states: AutomaticProcessingState[] = [
  { status: "unconfigured" },
  { status: "off" },
  { status: "on" },
  { status: "paused", shortLabel: "LLM connection missing" },
];

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex flex-col items-end gap-4">
      {states.map((state) => (
        <AutomaticProcessingControl
          key={state.status}
          action={prepareAutomaticProcessingAction({
            state,
            canWrite: true,
            saving: false,
            onSelect: fn(),
          })}
        />
      ))}
    </div>
  ),
});
