import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { InlineEditText } from "./InlineEditText";

const meta = preview.meta({
  component: InlineEditText,
  args: {
    onSave: fn(),
    value: "Latency overview",
  },
});

export const Default = meta.story({});

export const Empty = meta.story({
  args: {
    value: "",
    placeholder: "Untitled dashboard",
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});

export const WithLongValue = meta.story({
  args: {
    value:
      "A dashboard name that is far too long to fit comfortably in most layouts and should truncate",
  },
});

export const InHeading = meta.story({
  render: (args) => (
    <h2 className="text-lg leading-7 font-bold">
      <InlineEditText {...args} />
    </h2>
  ),
});

export const TestCommitsOnEnter = meta.story({
  name: "(Test) Commits on Enter",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button"));
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed dashboard{enter}");
    await expect(args.onSave).toHaveBeenCalledWith("Renamed dashboard");
    // Back in display mode with the edit affordance
    await expect(canvas.getByRole("button")).toBeInTheDocument();
  },
});

export const TestEscapeReverts = meta.story({
  name: "(Test) Escape reverts",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button"));
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Discarded{escape}");
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(canvas.getByRole("button")).toHaveTextContent(
      "Latency overview",
    );
  },
});

export const TestEmptyRequiredReverts = meta.story({
  name: "(Test) Empty required reverts",
  args: {
    required: true,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button"));
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.keyboard("{enter}");
    await expect(args.onSave).not.toHaveBeenCalled();
  },
});
