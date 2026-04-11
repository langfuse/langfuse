import { render, screen, within } from "@testing-library/react";
import {
  SpielwieseModelPickerPanel,
  SpielwieseModelPickerTrigger,
} from "./SpielwieseModelPicker";

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
  it("renders a flatter picker shell and preselects the current provider", () => {
    render(
      <SpielwieseModelPickerPanel
        currentModel="GPT-4.1 mini"
        hoveredModelLabel={null}
        onClose={() => {}}
        onValueChange={() => {}}
        providerId={null}
        setHoveredModelLabel={() => {}}
        setProviderId={() => {}}
        setShowLegacyModels={() => false}
        showLegacyModels={false}
      />,
    );

    const panel = screen.getByRole("dialog", { name: "Model picker" });
    const grid = screen.getByTestId("spielwiese-model-picker-grid");
    const openAiButton = screen.getByRole("button", { name: "OpenAI" });
    const gpt54Button = screen.getByRole("button", { name: "GPT-5.4" });
    const modelColumn = grid.children[1] as HTMLElement | undefined;

    expect(panel.className).toContain("rounded-[16px]");
    expect(panel.className).toContain("bg-[#FCFCFA]");
    expect(panel.className).not.toContain("backdrop-blur");
    expect(panel.className).not.toContain("bg-[linear-gradient");
    expect(grid.className).toContain("grid-cols-[10.5rem_13.75rem]");
    expect(openAiButton.className).toContain("ring-1");
    expect(gpt54Button).toBeTruthy();
    expect(modelColumn?.className).toContain("border-l");
  });
});
