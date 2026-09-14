import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { SelectInput } from "./SelectInput";

const longOptionLabel =
  "This is a very long option label that should remain on a single line without wrapping";

const meta = preview.meta({
  component: SelectInput,
});

export const Default = meta.story({
  args: {
    value: "gpt-4.1",
    placeholder: "Select a model",
    options: [
      {
        type: "group",
        id: "openai",
        label: "OpenAI",
        options: [
          { value: "gpt-4.1", label: "GPT-4.1" },
          { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
          { value: "gpt-4.1-nano", label: "GPT-4.1 nano" },
          { value: "o3", label: "o3" },
        ],
      },
      {
        type: "group",
        id: "anthropic",
        label: "Anthropic",
        options: [
          {
            value: "claude-opus-4",
            label: "Claude Opus 4",
            disabled: true,
            disabledReason: "Claude Opus 4 is not available for this project.",
          },
          { value: "claude-sonnet-4", label: "Claude Sonnet 4" },
          { value: "claude-haiku-3.5", label: "Claude Haiku 3.5" },
          { value: "claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
        ],
      },
      {
        type: "group",
        id: "google",
        label: "Google",
        options: [
          { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
          { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
          { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
          { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
        ],
      },
    ],
    onValueChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);

    return (
      <SelectInput
        {...args}
        value={value}
        onValueChange={(newValue) => {
          setValue(newValue);
          args.onValueChange(newValue);
        }}
      />
    );
  },
});

export const WithLongText = meta.story({
  args: {
    value: "long-option",
    placeholder: "Select an option",
    options: [
      {
        value: "long-option",
        label: longOptionLabel,
      },
    ],
    onValueChange: fn(),
  },
  render: (args) => (
    <div className="w-64">
      <SelectInput {...args} />
    </div>
  ),
});

export const TestKeyboardSelection = meta.story({
  name: "(Test) Keyboard Selection",
  args: {
    value: "gpt-4.1",
    placeholder: "Select a model",
    options: [
      { value: "gpt-4.1", label: "GPT-4.1" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    ],
    onValueChange: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("combobox");

    await userEvent.click(trigger);

    const firstOption = body.getByRole("option", { name: "GPT-4.1" });
    const secondOption = body.getByRole("option", {
      name: "GPT-4.1 mini",
    });
    await expect(firstOption).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await expect(secondOption).toHaveFocus();

    await userEvent.keyboard("{ArrowUp}");
    await expect(firstOption).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onValueChange).toHaveBeenCalledWith("gpt-4.1-mini");
  },
});

export const TestSkipsDisabledOption = meta.story({
  name: "(Test) Skips Disabled Option",
  args: {
    value: "gpt-4.1",
    placeholder: "Select a model",
    options: [
      { value: "gpt-4.1", label: "GPT-4.1" },
      {
        value: "gpt-4.1-mini",
        label: "GPT-4.1 mini",
        disabled: true,
        disabledReason: "GPT-4.1 mini is not available for this project.",
      },
      { value: "gpt-4.1-nano", label: "GPT-4.1 nano" },
    ],
    onValueChange: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox"));
    await userEvent.keyboard("{ArrowDown}");

    const enabledOption = body.getByRole("option", { name: "GPT-4.1 nano" });
    await expect(enabledOption).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect(args.onValueChange).toHaveBeenCalledWith("gpt-4.1-nano");
  },
});

export const TestForwardsTriggerProps = meta.story({
  name: "(Test) Forwards Trigger Props",
  args: {
    value: "gpt-4.1",
    placeholder: "Select a model",
    options: [{ value: "gpt-4.1", label: "GPT-4.1" }],
    onValueChange: fn(),
  },
  render: (args) => (
    <>
      <label htmlFor="model-select">Model</label>
      <SelectInput {...args} id="model-select" />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("combobox");

    await expect(trigger).toHaveAttribute("id", "model-select");
    await userEvent.click(canvas.getByText("Model"));
    await expect(body.getByRole("option", { name: "GPT-4.1" })).toHaveFocus();
  },
});
