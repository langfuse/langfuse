import { expect, fn, userEvent, within } from "storybook/test";
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

export const ReadOnlyPaused = meta.story({
  name: "(Test) Read-only users can see the pause reason",
  args: {
    action: prepareAutomaticProcessingAction({
      state: { status: "paused", shortLabel: "LLM connection missing" },
      canWrite: false,
      saving: false,
      onSelect: fn(),
    }),
  },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", {
      name: "Automatic processing",
    });
    await expect(button).toBeDisabled();
    await userEvent.hover(button.parentElement!);
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("LLM connection missing");
    await expect(tooltip).toHaveTextContent(
      "You need permission to edit Topics.",
    );
  },
});
