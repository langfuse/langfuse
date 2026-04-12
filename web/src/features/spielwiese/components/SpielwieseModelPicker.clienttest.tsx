import { fireEvent, render, screen, within } from "@testing-library/react";
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
  const [showLegacyModels, setShowLegacyModels] = useState(false);

  return (
    <SpielwieseModelPickerPanel
      currentModel={selectedModel}
      hoveredModelLabel={hoveredModelLabel}
      onClose={() => {}}
      onValueChange={setSelectedModel}
      providerId={providerId}
      setHoveredModelLabel={setHoveredModelLabel}
      setProviderId={setProviderId}
      setShowLegacyModels={setShowLegacyModels}
      showLegacyModels={showLegacyModels}
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
  const selectionPane = screen.getByTestId(
    "spielwiese-model-picker-selection-pane",
  );
  const recommendButton = within(panel).getByRole("button", {
    name: "Recommend model",
  });

  expect(panel.className).toContain("w-[42rem]");
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
  expect(grid.className).toContain("h-[31rem]");
  expect(grid.className).toContain("min-w-0");
  expect(grid.className).toContain("overflow-hidden");
  expect(grid.className).toContain(
    "rounded-[var(--spielwiese-picker-inner-radius)]",
  );
  expect(within(panel).getByRole("button", { name: "OpenAI" })).toBeTruthy();
  expect(within(panel).getByText("Providers")).toBeTruthy();
  expect(within(panel).queryByText("Models")).toBeNull();
  expect(within(panel).queryByText("Benchmarks")).toBeNull();
  expect(within(panel).queryByRole("button", { name: "GPT-5.4" })).toBeNull();
  expect(within(panel).queryByText(/Frontier general-purpose/i)).toBeNull();
  expect(recommendButton.className).toContain("text-[#6F4124]");

  return { panel, selectionPane };
}

function selectProvider(panel: HTMLElement, providerName: string) {
  fireEvent.click(within(panel).getByRole("button", { name: providerName }));
}

function expectHoverPrompt(preview: HTMLElement) {
  expect(preview.textContent).toContain("Hover a model to inspect benchmarks.");
}

function getBenchmarkPreview(panel: HTMLElement) {
  return within(panel).getByTestId("spielwiese-model-picker-benchmark-preview");
}

function hoverModel(panel: HTMLElement, modelName: string) {
  const modelButton = within(panel).getByRole("button", { name: modelName });

  fireEvent.mouseEnter(modelButton);

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

describe("SpielwieseModelPickerPanel chrome", () => {
  it("starts provider-only, then reveals recent models and benchmark details without changing the shell size", () => {
    renderModelPickerPanel();

    const { panel, selectionPane } = expectDefaultPickerChrome();

    expect(selectionPane.childElementCount).toBe(0);

    selectProvider(panel, "OpenAI");

    const preview = getBenchmarkPreview(panel);
    const olderToggle = within(panel).getByTestId(
      "spielwiese-model-picker-older-toggle",
    );

    expect(within(panel).getByText("Models")).toBeTruthy();
    expect(within(panel).getByText("Benchmarks")).toBeTruthy();
    expectHoverPrompt(preview);

    hoverModel(panel, "GPT-5.4");

    const hoveredPreview = getBenchmarkPreview(panel);

    expect(hoveredPreview.textContent).toContain("GPT-5.4");
    expect(hoveredPreview.textContent).toContain("Intelligence");
    expect(hoveredPreview.textContent).toContain("$82");
    expect(hoveredPreview.textContent).toContain("Text to image place");

    fireEvent.click(olderToggle);

    expect(
      within(panel).getByRole("button", { name: "GPT-4.1 mini" }),
    ).toBeTruthy();
  });

  it("switches providers, keeps only the latest models visible first, and reveals older models on demand", () => {
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

    const preview = getBenchmarkPreview(panel);

    expectHoverPrompt(preview);
    hoverModel(panel, "Claude Sonnet 4.6");

    const hoveredPreview = getBenchmarkPreview(panel);

    expect(hoveredPreview.textContent).toContain("Claude Sonnet 4.6");
    expect(hoveredPreview.textContent).toContain("Agentic index");
    expect(hoveredPreview.textContent).toContain("Weights");

    fireEvent.click(
      within(panel).getByTestId("spielwiese-model-picker-older-toggle"),
    );

    expect(
      within(panel).getByRole("button", { name: "Claude 3.7 Sonnet" }),
    ).toBeTruthy();
  });
});
