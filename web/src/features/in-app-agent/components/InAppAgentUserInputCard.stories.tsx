import preview from "../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { InAppAgentUserInputCard } from "./InAppAgentUserInputCard";

const meta = preview.meta({
  component: InAppAgentUserInputCard,
});

export const SingleSelect = meta.story({
  name: "(Test) Single select",
  args: {
    isCompact: true,
    userInput: {
      id: "ask-1",
      status: "pending",
      question: "Which environment should I query?",
      options: [{ label: "production" }, { label: "staging" }],
      selectionMode: "single_select",
    },
    onSubmitUserInput: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Which environment should I query?"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "production" }));
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(args.onSubmitUserInput).toHaveBeenCalledWith("ask-1", {
      answer: "production",
    });
  },
});
