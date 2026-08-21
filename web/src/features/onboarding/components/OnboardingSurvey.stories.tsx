import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { OnboardingSurvey } from "./OnboardingSurvey";

const meta = preview.meta({
  component: OnboardingSurvey,
  parameters: { layout: "fullscreen" },
});

export const Default = meta.story({
  args: {
    state: "form",
    canConfigureAiFeatures: true,
    onSubmit: fn(async () => undefined),
  },
});

export const WithoutAiFeaturesChoice = meta.story({
  args: {
    state: "form",
    canConfigureAiFeatures: false,
    onSubmit: fn(async () => undefined),
  },
});

export const SettingUpProject = meta.story({
  args: {
    state: "completing",
  },
});

export const Error = meta.story({
  args: {
    state: "error",
  },
});

const optOutSubmit = fn(async () => undefined);

export const SubmitsAiFeaturesOptOut = meta.story({
  name: "(Test) Submits AI Features Opt-Out",
  args: {
    state: "form",
    canConfigureAiFeatures: true,
    onSubmit: optOutSubmit,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("switch", { name: "Enable AI powered features" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Skip" }));

    await expect(optOutSubmit).toHaveBeenCalledWith({
      referralSource: undefined,
      aiFeaturesEnabled: false,
    });
  },
});
