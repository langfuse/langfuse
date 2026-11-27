import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { NewOrganizationForm } from "./NewOrganizationForm";

const meta = preview.meta({
  component: NewOrganizationForm,
});

export const Cloud = meta.story({
  name: "(Test) Cloud",
  args: {
    isLangfuseCloud: true,
    onSubmit: fn(async () => undefined),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("switch", { name: "Enable AI powered features" }),
    ).toBeChecked();
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Organization name" }),
      "Acme",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));

    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: "Acme",
      aiFeaturesEnabled: true,
    });
  },
});

export const SelfHosted = meta.story({
  args: {
    isLangfuseCloud: false,
    onSubmit: fn(async () => undefined),
  },
});

const optOutSubmit = fn(async () => undefined);

export const SubmitsAiFeaturesOptOut = meta.story({
  name: "(Test) Submits AI Features Opt-Out",
  args: {
    isLangfuseCloud: true,
    onSubmit: optOutSubmit,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Organization name" }),
      "Acme",
    );
    await userEvent.click(
      canvas.getByRole("switch", { name: "Enable AI powered features" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));

    await expect(optOutSubmit).toHaveBeenCalledWith({
      name: "Acme",
      aiFeaturesEnabled: false,
    });
  },
});
