import { type ComponentProps, useState } from "react";
import { BarChart3, LineChart } from "@langfuse/icons";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { MultiSelectTagInput } from "../MultiSelectTagInput/MultiSelectTagInput";
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

export const WithIconsAndExplanations = meta.story({
  args: {
    value: "line",
    placeholder: "Select a chart type",
    options: [
      {
        value: "line",
        label: "Line chart",
        icon: LineChart,
        explanation: {
          title: "Line chart",
          description: "Show how a value changes over time.",
          badges: [{ label: "Category", value: "Time series" }],
        },
      },
      {
        value: "bar",
        label: "Bar chart",
        icon: BarChart3,
        explanation: {
          title: "Bar chart",
          description: "Compare values across categories.",
          badges: [{ label: "Category", value: "Comparison" }],
        },
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

/** A single option set apart below the regular ones, without a group heading. */
export const WithCustomOption = meta.story({
  args: {
    value: "eu",
    placeholder: "Select a region",
    options: [
      {
        type: "group",
        id: "regions",
        label: "Regions",
        options: [
          { value: "us", label: "United States" },
          { value: "eu", label: "Europe" },
        ],
      },
    ],
    customOption: { value: "custom", label: "Custom" },
    onValueChange: fn(),
  },
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
        badges: [{ text: "Trace" }, { text: "Observation" }],
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

const modelOptions = [
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
] satisfies ComponentProps<typeof SelectInput>["options"];

export const WithoutSelection = meta.story({
  args: {
    value: "",
    placeholder: "Select a model",
    options: modelOptions,
    onValueChange: fn(),
  },
  render: (args) => (
    <div className="w-72">
      <SelectInput {...args} />
    </div>
  ),
});

export const Clearable = meta.story({
  args: {
    value: "gpt-4.1",
    placeholder: "Select a model",
    options: modelOptions,
    onValueChange: fn(),
    clearAction: { label: "Clear selection", onClear: fn() },
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);

    return (
      <div className="w-72">
        <SelectInput
          {...args}
          value={value}
          clearAction={{
            label: "Clear selection",
            onClear: () => {
              setValue("");
              args.clearAction?.onClear();
            },
          }}
          onValueChange={(newValue) => {
            setValue(newValue);
            args.onValueChange(newValue);
          }}
        />
      </div>
    );
  },
});

const tagOptions = [
  { value: "production", label: "production" },
  { value: "staging", label: "staging" },
] as const;

function ClearIndicatorComparison() {
  return (
    <div className="flex items-start gap-4">
      <div className="w-72">
        <SelectInput
          value="gpt-4.1"
          placeholder="Select a model"
          options={modelOptions}
          onValueChange={() => undefined}
          clearAction={{ label: "Clear selection", onClear: () => undefined }}
        />
      </div>
      <div className="w-72">
        <MultiSelectTagInput
          aria-label="Tags"
          value={["production", "staging"]}
          options={[...tagOptions]}
          onValueChange={() => undefined}
          placeholder="Tags"
          searchPlaceholder="Search tags"
          emptyMessage="No tags"
        />
      </div>
    </div>
  );
}

const alignmentArgs = {
  value: "gpt-4.1",
  placeholder: "Select a model",
  options: modelOptions,
  onValueChange: fn(),
} satisfies ComponentProps<typeof SelectInput>;

export const ClearIndicatorAlignment = meta.story({
  name: "Clear indicator alignment",
  args: alignmentArgs,
  render: () => <ClearIndicatorComparison />,
});

export const TestClearIndicatorAlignment = meta.story({
  name: "(Test) Clear indicators align",
  args: alignmentArgs,
  render: () => <ClearIndicatorComparison />,
  play: async ({ canvasElement }) => {
    const indicators = [
      ...canvasElement.querySelectorAll("[data-select-indicator='clear']"),
    ];
    await expect(indicators).toHaveLength(2);
    const insets = indicators.map((indicator) => {
      const field = indicator.parentElement;
      if (!field) throw new Error("Indicator has no field");
      const fieldBox = field.getBoundingClientRect();
      const indicatorBox = indicator.getBoundingClientRect();
      return {
        right: Math.round(fieldBox.right - indicatorBox.right),
        center: Math.round(
          indicatorBox.top +
            indicatorBox.height / 2 -
            (fieldBox.top + fieldBox.height / 2),
        ),
      };
    });
    await expect(insets[0]).toEqual(insets[1]);
  },
});

export const Disabled = meta.story({
  args: {
    value: "gpt-4.1",
    placeholder: "Select a model",
    options: modelOptions,
    disabled: true,
    onValueChange: fn(),
  },
  render: (args) => (
    <div className="w-72">
      <SelectInput {...args} />
    </div>
  ),
});

export const TestClearReplacesCaret = meta.story({
  name: "(Test) Clear replaces the caret",
  args: {
    value: "gpt-4.1",
    placeholder: "Select a model",
    options: modelOptions,
    onValueChange: fn(),
    clearAction: { label: "Clear selection", onClear: fn() },
  },
  render: (args) => (
    <div className="w-72">
      <SelectInput {...args} />
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox");

    await expect(
      canvasElement.querySelector("[data-select-indicator='caret']"),
    ).toBeNull();
    await expect(
      canvasElement.querySelector("[data-select-indicator='clear']"),
    ).not.toBeNull();
    await expect(trigger.querySelector("svg")).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "Clear selection" }),
    );
    await expect(args.clearAction?.onClear).toHaveBeenCalledOnce();
    await expect(
      canvasElement.ownerDocument.body.querySelector("[role='listbox']"),
    ).toBeNull();
  },
});

export const TestCaretOpensMenu = meta.story({
  name: "(Test) Caret opens the menu",
  args: {
    value: "",
    placeholder: "Select a model",
    options: modelOptions,
    onValueChange: fn(),
  },
  render: (args) => (
    <div className="w-72">
      <SelectInput {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox");
    const caret = canvasElement.querySelector(
      "[data-select-indicator='caret']",
    );
    if (!caret) throw new Error("Expected a caret indicator");
    const caretBox = caret.getBoundingClientRect();
    const hit = caret.ownerDocument.elementFromPoint(
      caretBox.left + caretBox.width / 2,
      caretBox.top + caretBox.height / 2,
    );
    await expect(hit && trigger.contains(hit)).toBe(true);
    if (!hit) throw new Error("Expected the caret to hit the trigger");
    await userEvent.click(hit);
    await waitFor(() =>
      expect(
        canvasElement.ownerDocument.body.querySelector("[role='listbox']"),
      ).not.toBeNull(),
    );
  },
});

export const TestClearWithoutMatchingOption = meta.story({
  name: "(Test) Clear stays when the option is missing",
  args: {
    value: "missing-baseline",
    placeholder: "Baseline name",
    options: modelOptions,
    onValueChange: fn(),
    search: { placeholder: "Search experiments..." },
    clearAction: { label: "Clear baseline", onClear: fn() },
  },
  render: (args) => (
    <div className="w-72">
      <SelectInput {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Clear baseline" }),
    ).toBeVisible();
    await expect(canvas.getByRole("combobox")).toHaveTextContent(
      "Baseline name",
    );
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

const disabledMiniReason = "GPT-4.1 mini is not available for this project.";

const optionsWithDisabledMini: ComponentProps<typeof SelectInput>["options"] = [
  { value: "gpt-4.1", label: "GPT-4.1" },
  {
    value: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    disabled: true,
    disabledReason: disabledMiniReason,
  },
  { value: "gpt-4.1-nano", label: "GPT-4.1 nano" },
];

export const TestDisabledOptionShowsReason = meta.story({
  name: "(Test) Disabled option shows its reason over its label",
  args: {
    value: "gpt-4.1",
    placeholder: "Select a model",
    options: optionsWithDisabledMini,
    onValueChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("combobox"));

    const label = await body.findByText("GPT-4.1 mini");
    await expect(label.closest("[title]")).toHaveAttribute(
      "title",
      disabledMiniReason,
    );
  },
});

export const TestSkipsDisabledOption = meta.story({
  name: "(Test) Skips Disabled Option",
  args: {
    value: "gpt-4.1",
    placeholder: "Select a model",
    options: optionsWithDisabledMini,
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
