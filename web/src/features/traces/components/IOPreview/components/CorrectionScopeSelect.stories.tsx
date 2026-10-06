import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../../../.storybook/preview";
import { CorrectionScopeSelect } from "./CorrectionScopeSelect";

const meta = preview.meta({ component: CorrectionScopeSelect });

export const Observation = meta.story({
  args: { value: "observation", isDisabled: false, onChange: fn() },
});

export const Trace = meta.story({
  args: { value: "trace", isDisabled: false, onChange: fn() },
});

export const SwitchScope = meta.story({
  name: "(Test) Switch scope",
  args: { value: "observation", isDisabled: false, onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Correction scope" }),
    );
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("option", { name: "Trace" }));
    await expect(args.onChange).toHaveBeenCalledTimes(1);
    await expect(args.onChange).toHaveBeenCalledWith("trace");
  },
});

export const InvalidEdit = meta.story({
  name: "(Test) Invalid edit prevents scope change",
  args: { value: "trace", isDisabled: true, onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole("combobox", {
      name: "Correction scope",
    });
    await expect(trigger).toBeDisabled();
    await userEvent.click(trigger);
    await expect(args.onChange).not.toHaveBeenCalled();
  },
});
