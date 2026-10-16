import { expect, fn, userEvent } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { EvaluatorGalleryAiBox } from "./EvaluatorGalleryAiBox";

const meta = preview.meta({ component: EvaluatorGalleryAiBox });

export const Default = meta.story({
  args: { onSubmit: fn(async () => true) },
});

export const ClearsPromptWhenSent = meta.story({
  name: "(Test) Clears the prompt once the assistant takes it",
  args: { onSubmit: fn(async () => true) },
  play: async ({ canvas, args }) => {
    const textarea = canvas.getByRole("textbox", {
      name: "Describe what you want to check",
    });
    await userEvent.type(textarea, "flag medical advice{Meta>}{Enter}{/Meta}");
    await expect(args.onSubmit).toHaveBeenCalledWith("flag medical advice");
    await expect(textarea).toHaveValue("");
  },
});

export const KeepsPromptWhenNotSent = meta.story({
  name: "(Test) Keeps the prompt when the assistant does not take it",
  args: { onSubmit: fn(async () => false) },
  play: async ({ canvas, args }) => {
    const textarea = canvas.getByRole("textbox", {
      name: "Describe what you want to check",
    });
    await userEvent.type(textarea, "flag medical advice");
    await userEvent.click(
      canvas.getByRole("button", { name: "Build with AI" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith("flag medical advice");
    await expect(textarea).toHaveValue("flag medical advice");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      /Not sent/,
    );
  },
});
