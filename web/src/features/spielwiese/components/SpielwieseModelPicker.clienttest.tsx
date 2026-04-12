import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import {
  SpielwieseModelPickerPanel,
  SpielwieseModelPickerTrigger,
} from "./SpielwieseModelPicker";

function ModelPickerHarness({
  currentModel = "GPT-4.1 mini",
}: {
  currentModel?: string;
}) {
  const [selectedModel, setSelectedModel] = useState(currentModel);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [hoveredModelLabel, setHoveredModelLabel] = useState<string | null>(
    null,
  );

  return (
    <SpielwieseModelPickerPanel
      currentModel={selectedModel}
      hoveredModelLabel={hoveredModelLabel}
      onClose={() => {}}
      onValueChange={setSelectedModel}
      providerId={providerId}
      setHoveredModelLabel={setHoveredModelLabel}
      setProviderId={setProviderId}
    />
  );
}

function renderModelPickerPanel({
  currentModel = "GPT-4.1 mini",
}: {
  currentModel?: string;
} = {}) {
  render(<ModelPickerHarness currentModel={currentModel} />);
}

function expectDefaultPickerChrome() {
  const panel = screen.getByRole("dialog", { name: "Model picker" });
  const grid = screen.getByTestId("spielwiese-model-picker-grid");
  const recommendButton = within(panel).getByRole("button", {
    name: "Recommend model",
  });

  expect(panel.className).toContain("w-fit");
  expect(panel.className).toContain(
    "rounded-[var(--spielwiese-picker-outer-radius)]",
  );
  expect(panel.className).toContain("p-[var(--spielwiese-picker-padding)]");
  expect(panel.className).toContain("overflow-visible");
  expect(panel.className).not.toContain("overflow-hidden");
  expect(panel.className).not.toContain("overflow-auto");
  expect(panel.className).not.toContain(
    "max-h-[min(28rem,var(--available-height))]",
  );
  expect(panel.className).not.toContain("min-w-[22rem]");
  expect(panel.className).not.toContain("w-[42rem]");
  expect(grid.className).not.toContain("h-[24rem]");
  expect(grid.className).toContain("h-auto");
  expect(grid.className).toContain("grid-cols-[11.5rem]");
  expect(grid.className).toContain("min-w-0");
  expect(grid.className).toContain("overflow-hidden");
  expect(grid.className).toContain(
    "rounded-[var(--spielwiese-picker-inner-radius)]",
  );
  expect(within(panel).getByRole("button", { name: "OpenAI" })).toBeTruthy();
  expect(within(panel).queryByText("Models")).toBeNull();
  expect(within(panel).queryByText("Benchmarks")).toBeNull();
  expect(within(panel).queryByText("Providers")).toBeNull();
  expect(within(panel).queryByRole("button", { name: "GPT-5.4" })).toBeNull();
  expect(within(panel).queryByText(/Frontier general-purpose/i)).toBeNull();
  expect(recommendButton.className).toContain("text-[#6F4124]");

  return { panel, grid };
}

function selectProvider(panel: HTMLElement, providerName: string) {
  fireEvent.click(within(panel).getByRole("button", { name: providerName }));
}

function getBenchmarkPreview(panel: HTMLElement) {
  return within(panel).getByTestId("spielwiese-model-picker-benchmark-preview");
}

function expectOpenAIBenchmarkPreview(panel: HTMLElement) {
  const hoveredPreview = getBenchmarkPreview(panel);
  const selectionPane = within(panel).getByTestId(
    "spielwiese-model-picker-selection-pane",
  );

  expect(selectionPane.className).toContain("w-[31rem]");
  expect(hoveredPreview.className).not.toContain("justify-center");
  expect(hoveredPreview.textContent).toContain("Intelligence");
  expect(hoveredPreview.textContent).toContain("Speed");
  expect(hoveredPreview.textContent).toContain("$82");
  expect(hoveredPreview.textContent).toContain("Image gen");
  expect(hoveredPreview.textContent).not.toContain("GPT-5.4");
  expect(hoveredPreview.textContent).not.toContain(
    "Strongest overall quality in the current OpenAI family.",
  );
}

function expectAnthropicBenchmarkPreview(panel: HTMLElement) {
  const hoveredPreview = getBenchmarkPreview(panel);

  expect(hoveredPreview.textContent).toContain("Agentic");
  expect(hoveredPreview.textContent).toContain("Weights");
  expect(hoveredPreview.textContent).not.toContain("Claude Sonnet 4.6");
  expect(hoveredPreview.textContent).not.toContain(
    "Leanest Claude option when you still want Claude tone.",
  );
}

function hoverModel(panel: HTMLElement, modelName: string) {
  const modelButton = within(panel).getByRole("button", { name: modelName });

  fireEvent.mouseEnter(modelButton);
  fireEvent.pointerEnter(modelButton);
  fireEvent.focus(modelButton);

  return modelButton;
}

describe("SpielwieseModelPickerTrigger icons", () => {
  it.each([
    ["GPT-4.1 mini", "spielwiese-provider-mark-openai"],
    ["Claude Sonnet 4.6", "spielwiese-provider-mark-anthropic"],
    ["Gemini 2.5 Flash", "spielwiese-provider-mark-google"],
    ["Grok 4", "spielwiese-provider-mark-xai"],
  ])("renders the correct provider mark for %s", (currentModel, testId) => {
    render(
      <SpielwieseModelPickerTrigger
        ariaLabel="Model picker"
        currentModel={currentModel}
        isOpen={false}
        onClick={() => {}}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Model picker" });

    expect(within(trigger).getByTestId(testId)).toBeTruthy();
  });

  it("renders only the model name when the selected value includes a trailing provider label", () => {
    render(
      <SpielwieseModelPickerTrigger
        ariaLabel="Model picker"
        currentModel="GPT-4.1 mini / OpenAI"
        isOpen={false}
        onClick={() => {}}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Model picker" });

    expect(
      within(trigger).getByTestId("spielwiese-provider-mark-openai"),
    ).toBeTruthy();
    expect(trigger.textContent).toContain("GPT-4.1 mini");
    expect(trigger.textContent).not.toContain("OpenAI");
  });
});

describe("SpielwieseModelPickerPanel initial chrome", () => {
  it("starts provider-only, then reveals recent models without changing the shell size", () => {
    renderModelPickerPanel();

    const { panel, grid } = expectDefaultPickerChrome();

    expect(
      within(panel).queryByTestId("spielwiese-model-picker-selection-pane"),
    ).toBeNull();

    selectProvider(panel, "OpenAI");

    const selectionPane = within(panel).getByTestId(
      "spielwiese-model-picker-selection-pane",
    );

    expect(grid.className).toContain("grid-cols-[11.5rem_auto]");
    expect(within(panel).queryByText("Benchmarks")).toBeNull();
    expect(within(panel).queryByText("Models")).toBeNull();
    expect(
      within(panel).queryByTestId("spielwiese-model-picker-benchmark-preview"),
    ).toBeNull();
    expect(
      within(panel).queryByTestId("spielwiese-model-picker-older-toggle"),
    ).toBeNull();
    expect(selectionPane.className).toContain("w-[16.25rem]");
    expect(selectionPane.className).not.toContain("h-full");
    expect(selectionPane.className).toContain("h-auto");
  });
});

describe("SpielwieseModelPickerPanel OpenAI benchmark preview", () => {
  it("reveals compact benchmark details without an older-model toggle", async () => {
    renderModelPickerPanel();

    const panel = screen.getByRole("dialog", { name: "Model picker" });

    selectProvider(panel, "OpenAI");

    hoverModel(panel, "GPT-5.4");

    expectOpenAIBenchmarkPreview(panel);
    expect(
      within(panel).queryByTestId("spielwiese-model-picker-older-toggle"),
    ).toBeNull();
    expect(
      within(panel).queryByRole("button", { name: "GPT-4.1 mini" }),
    ).toBeNull();

    const intelligenceTrigger = within(panel).getByLabelText(
      "Intelligence benchmark details",
    );

    fireEvent.mouseEnter(intelligenceTrigger);
    fireEvent.focus(intelligenceTrigger);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Artificial Analysis" }),
      ).toBeTruthy();
    });
    expect(
      screen
        .getByRole("link", { name: "Artificial Analysis" })
        .getAttribute("href"),
    ).toBe(
      "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
    );
  });
});

describe("SpielwieseModelPickerPanel Anthropic provider switching", () => {
  it("switches providers and keeps only the latest models visible", () => {
    renderModelPickerPanel();

    const panel = screen.getByRole("dialog", { name: "Model picker" });

    selectProvider(panel, "Anthropic");

    expect(
      within(panel).getByRole("button", { name: "Claude Opus 4.6" }),
    ).toBeTruthy();
    expect(
      within(panel).getByRole("button", { name: "Claude Sonnet 4.6" }),
    ).toBeTruthy();
    expect(
      within(panel).queryByRole("button", { name: "Claude 3.7 Sonnet" }),
    ).toBeNull();
    expect(within(panel).queryByRole("button", { name: "GPT-5.4" })).toBeNull();
    hoverModel(panel, "Claude Sonnet 4.6");

    expectAnthropicBenchmarkPreview(panel);
    expect(
      within(panel).queryByTestId("spielwiese-model-picker-older-toggle"),
    ).toBeNull();
    expect(
      within(panel).queryByRole("button", { name: "Claude 3.7 Sonnet" }),
    ).toBeNull();
  });
});
