import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
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

export const SearchableWithBadges = meta.story({
  name: "(Test) Searchable with badges",
  args: {
    value: "quality",
    placeholder: "Select a key",
    search: { placeholder: "Search keys..." },
    options: [
      {
        value: "quality",
        label: "quality",
        badges: [
          { text: "Trace", color: "violet" },
          { text: "Observation", color: "blue" },
        ],
      },
      { value: "relevance", label: "relevance" },
    ],
    onValueChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-64">
        <SelectInput {...args} value={value} onValueChange={setValue} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox"));
    await userEvent.type(
      body.getByPlaceholderText("Search keys..."),
      "relevance",
    );
    await expect(body.getByRole("option", { name: /relevance/ })).toBeVisible();
    await userEvent.click(body.getByRole("option", { name: /relevance/ }));
    await expect(canvas.getByRole("combobox")).toHaveTextContent("relevance");
  },
});

export const Empty = meta.story({
  name: "(Test) Empty",
  args: {
    value: "",
    placeholder: "Select a model",
    options: [],
    emptyMessage: "No models available.",
    onValueChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox"));
    await waitFor(() =>
      expect(body.getByText("No models available.")).toBeVisible(),
    );
  },
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

export const TestKeepsBadgedLabelReadable = meta.story({
  name: "(Test) Keeps Badged Label Readable",
  args: {
    // The geometry the score-key picker actually ships in: a filter-sidebar
    // width popover, a score name long enough to matter, and both level pills
    // because one name can be scored at trace *and* observation level.
    value: "answer_relevancy",
    placeholder: "Select a key",
    search: { placeholder: "Search keys..." },
    options: [
      {
        value: "answer_relevancy",
        label: "answer_relevancy",
        badges: [
          { text: "Trace", color: "violet" },
          { text: "Observation", color: "blue" },
        ],
      },
    ],
    onValueChange: fn(),
  },
  render: (args) => (
    <div className="w-50">
      <SelectInput {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox"));

    const option = await body.findByRole("option", {
      name: /answer_relevancy/,
    });
    // The pills wrap beneath the name rather than squeezing it, so the name is
    // laid out at its full width instead of being ellipsised to a few
    // characters.
    const label = within(option).getByTitle("answer_relevancy");
    await waitFor(() => {
      // `scrollWidth <= clientWidth` alone is also satisfied by 0 <= 0, which
      // is the collapsed state being guarded against — so pin the width too.
      expect(label.clientWidth).toBeGreaterThan(0);
      expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
      // Both pills survive the wrap — the name must not be won back by
      // dropping the level information.
      expect(within(option).getByText("Trace")).toBeVisible();
      expect(within(option).getByText("Observation")).toBeVisible();
    });
  },
});

export const TestKeepsBadgedLabelReadableWithoutSearch = meta.story({
  name: "(Test) Keeps Badged Label Readable Without Search",
  args: {
    // Same case as above through the plain SelectPrimitive branch, which takes
    // a different code path for badges and was otherwise untested.
    value: "answer_relevancy",
    placeholder: "Select a key",
    options: [
      {
        value: "answer_relevancy",
        label: "answer_relevancy",
        badges: [
          { text: "Trace", color: "violet" },
          { text: "Observation", color: "blue" },
        ],
      },
    ],
    onValueChange: fn(),
  },
  render: (args) => (
    <div className="w-50">
      <SelectInput {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox"));

    const option = await body.findByRole("option", {
      name: /answer_relevancy/,
    });
    const label = within(option).getByTitle("answer_relevancy");
    await waitFor(() => {
      expect(label.clientWidth).toBeGreaterThan(0);
      expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
      expect(within(option).getByText("Trace")).toBeVisible();
      expect(within(option).getByText("Observation")).toBeVisible();
    });
  },
});
