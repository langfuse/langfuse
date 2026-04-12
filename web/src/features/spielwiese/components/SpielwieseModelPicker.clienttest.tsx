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
  const preview = screen.getByTestId(
    "spielwiese-model-picker-benchmark-preview",
  );
  const recommendButton = within(panel).getByRole("button", {
    name: "Recommend model",
  });

  expect(panel.className).toContain("w-[min(42rem,var(--available-width))]");
  expect(panel.className).toContain("overflow-auto");
  expect(panel.className).toContain("overscroll-contain");
  expect(panel.className).not.toContain("overflow-hidden");
  expect(panel.className).not.toContain("min-w-[22rem]");
  expect(grid.className).toContain("min-w-max");
  expect(within(panel).getByRole("button", { name: "OpenAI" })).toBeTruthy();
  expect(within(panel).getByText("Providers")).toBeTruthy();
  expect(within(panel).getByText("Models")).toBeTruthy();
  expect(within(panel).getByText("Benchmarks")).toBeTruthy();
  expect(preview.textContent).toContain("GPT-4.1 mini");
  expect(preview.textContent).toContain(
    "Good compatibility bridge from existing prompts.",
  );
  expect(
    within(panel).queryByRole("button", { name: "GPT-4.1 mini" }),
  ).toBeNull();
  expect(recommendButton.className).toContain("text-[#6F4124]");

  return { panel, preview };
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
  it("renders the provider rail, recent models, benchmark preview, and older-model toggle without clipping the shell", () => {
    renderModelPickerPanel();

    const { panel, preview } = expectDefaultPickerChrome();
    const gpt54Button = within(panel).getByRole("button", { name: "GPT-5.4" });
    const olderToggle = within(panel).getByTestId(
      "spielwiese-model-picker-older-toggle",
    );

    fireEvent.mouseEnter(gpt54Button);

    expect(preview.textContent).toContain("GPT-5.4");
    expect(preview.textContent).toContain(
      "Strongest overall quality in the current OpenAI family.",
    );
    expect(within(preview).getByText("Token cost")).toBeTruthy();

    fireEvent.click(olderToggle);

    expect(
      within(panel).getByRole("button", { name: "GPT-4.1 mini" }),
    ).toBeTruthy();
  });

  it("switches providers, keeps only the latest models visible first, and reveals older models on demand", () => {
    renderModelPickerPanel();

    const panel = screen.getByRole("dialog", { name: "Model picker" });
    const preview = screen.getByTestId(
      "spielwiese-model-picker-benchmark-preview",
    );

    fireEvent.click(within(panel).getByRole("button", { name: "Anthropic" }));

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
    expect(preview.textContent).toContain("Claude Opus 4.6");

    fireEvent.click(
      within(panel).getByTestId("spielwiese-model-picker-older-toggle"),
    );

    expect(
      within(panel).getByRole("button", { name: "Claude 3.7 Sonnet" }),
    ).toBeTruthy();
  });
});
