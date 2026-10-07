import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { orderBuildIntentOptions } from "../lib/buildIntent";
import { OnboardingSurvey } from "./OnboardingSurvey";

const buildIntentOptions = orderBuildIntentOptions("storybook-user");

const meta = preview.meta({
  component: OnboardingSurvey,
  parameters: { layout: "fullscreen" },
});

export const Default = meta.story({
  args: {
    state: "form",
    buildIntentOptions,
    canConfigureAiFeatures: true,
    onSubmit: fn(async () => undefined),
  },
});

export const WithoutAiFeaturesChoice = meta.story({
  name: "(Test) Without AI Features Choice",
  args: {
    state: "form",
    buildIntentOptions,
    canConfigureAiFeatures: false,
    onSubmit: fn(async () => undefined),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.queryByRole("switch", { name: "Enable AI powered features" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Organizational settings" }),
    ).not.toBeInTheDocument();
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

const defaultSubmit = fn(async () => undefined);

export const SubmitsAiFeaturesDefault = meta.story({
  name: "(Test) Submits AI Features Default",
  args: {
    state: "form",
    buildIntentOptions,
    canConfigureAiFeatures: true,
    onSubmit: defaultSubmit,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("switch", { name: "Enable AI powered features" }),
    ).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));

    await expect(defaultSubmit).toHaveBeenCalledWith({
      referralSource: undefined,
      aiFeaturesEnabled: true,
      buildIntents: [],
      buildIntentOther: undefined,
    });
  },
});

const optOutSubmit = fn(async () => undefined);

export const SubmitsAiFeaturesOptOut = meta.story({
  name: "(Test) Submits AI Features Opt-Out",
  args: {
    state: "form",
    buildIntentOptions,
    canConfigureAiFeatures: true,
    onSubmit: optOutSubmit,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("switch", { name: "Enable AI powered features" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));

    await expect(optOutSubmit).toHaveBeenCalledWith({
      referralSource: undefined,
      aiFeaturesEnabled: false,
      buildIntents: [],
      buildIntentOther: undefined,
    });
  },
});

const buildIntentSubmit = fn(async () => undefined);

export const SubmitsBuildIntents = meta.story({
  name: "(Test) Submits Build Intents",
  args: {
    state: "form",
    buildIntentOptions,
    canConfigureAiFeatures: false,
    onSubmit: buildIntentSubmit,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Just exploring/ }),
    );
    await userEvent.click(canvas.getByRole("checkbox", { name: /RAG/ }));
    await expect(
      canvas.getByRole("checkbox", { name: /Just exploring/ }),
    ).not.toBeChecked();

    await userEvent.click(canvas.getByRole("checkbox", { name: /Other/ }));
    await userEvent.type(
      canvas.getByRole("textbox", {
        name: "What else will you use Langfuse for?",
      }),
      "Eval pipeline",
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /coding agents/ }),
    );
    await expect(
      canvas.getByRole("checkbox", { name: /Autonomous agents/ }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("checkbox", { name: /Just exploring/ }),
    ).toBeEnabled();

    await userEvent.click(canvas.getByRole("button", { name: "Next" }));

    await expect(buildIntentSubmit).toHaveBeenCalledWith({
      referralSource: undefined,
      aiFeaturesEnabled: true,
      buildIntents: ["rag", "other", "coding_agents"],
      buildIntentOther: "Eval pipeline",
    });
  },
});
