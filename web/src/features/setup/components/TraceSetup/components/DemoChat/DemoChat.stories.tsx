import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { answeredTurn } from "../TracePreview/TracePreview.fixtures";
import { DemoChat } from "./DemoChat";

const meta = preview.meta({
  component: DemoChat,
});

const actions = { onSend: fn(), onSetUpApp: fn(), onLeave: fn() };

export const Empty = meta.story({
  args: { turns: [], ...actions },
});

export const Answered = meta.story({
  args: { turns: [answeredTurn], ...actions },
});

export const WaitsWhileAnswering = meta.story({
  name: "(Test) While it answers, the box waits and the trace builds",
  args: {
    turns: [{ question: "What does Langfuse do?", answer: null, trace: null }],
    ...actions,
  },
  play: async ({ canvasElement }) => {
    const chat = within(canvasElement);
    await expect(
      chat.getByRole("textbox", { name: "Message to the demo app" }),
    ).toBeDisabled();
    await expect(chat.getByRole("status")).toHaveTextContent(
      "Building the trace",
    );
  },
});

export const AsksASuggestion = meta.story({
  name: "(Test) Sends a suggested question",
  args: { turns: [], ...actions },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "What does Langfuse do?",
      }),
    );
    await expect(args.onSend).toHaveBeenCalledWith("What does Langfuse do?");
  },
});

export const SendsATypedMessage = meta.story({
  name: "(Test) Sends a typed message, trimmed, and clears the box",
  args: { turns: [], ...actions },
  play: async ({ args, canvasElement }) => {
    const box = within(canvasElement).getByRole("textbox", {
      name: "Message to the demo app",
    });
    await userEvent.type(box, "  Why is it slow?  {Enter}");
    await expect(args.onSend).toHaveBeenCalledWith("Why is it slow?");
    await expect(box).toHaveValue("");
  },
});

export const HandsOverToTheSetup = meta.story({
  name: "(Test) A demo trace hands over to the app's setup",
  args: { turns: [answeredTurn], ...actions },
  play: async ({ args, canvasElement }) => {
    const chat = within(canvasElement);
    // The demo trace rises in over 260 ms
    await waitFor(() => expect(chat.getByText("demo-chat")).toBeVisible());
    await userEvent.click(
      chat.getByRole("button", { name: "Set up your app" }),
    );
    await expect(args.onSetUpApp).toHaveBeenCalledOnce();
  },
});
