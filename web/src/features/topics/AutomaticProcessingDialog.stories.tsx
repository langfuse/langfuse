import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { AutomaticProcessingDialog } from "./AutomaticProcessingDialog";

const meta = preview.meta({
  component: AutomaticProcessingDialog,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <DialogController<null>
        initialState={() => null}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
  args: {
    initialEnabled: false,
    initialSampling: 1,
    dailyTraces: 180,
    missingModel: false,
    saving: false,
    error: null,
    onSave: fn(),
  },
});

export default meta;

export const Off = meta.story({});

export const On = meta.story({
  args: { initialEnabled: true, initialSampling: 0.25 },
});

export const CountingTraces = meta.story({
  args: { dailyTraces: null },
});

export const MissingModel = meta.story({
  name: "(Test) A missing model blocks turning on",
  args: { missingModel: true },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(body.getByRole("switch", { name: "Auto-analyze" }));
    await expect(body.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(
      body.getByText("Choose every model in Settings before turning this on."),
    ).toBeInTheDocument();
  },
});

export const ShowsEstimate = meta.story({
  name: "(Test) The estimate follows the sample rate",
  args: { initialSampling: 0.25 },
  play: async () => {
    const body = within(document.body);
    await expect(
      body.getByText("~45 new traces a day, based on the last 7 days"),
    ).toBeInTheDocument();
  },
});

export const SubmitsSampling = meta.story({
  name: "(Test) Turning on saves the chosen sampling rate",
  args: { initialSampling: 0.25 },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(body.getByRole("switch", { name: "Auto-analyze" }));
    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledWith({
      enabled: true,
      sampling: 0.25,
    });
  },
});

export const TurnsOff = meta.story({
  name: "(Test) Turning off saves auto-analyze as off",
  args: { initialEnabled: true, initialSampling: 0.25 },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(body.getByRole("switch", { name: "Auto-analyze" }));
    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledWith({
      enabled: false,
      sampling: 0.25,
    });
  },
});
