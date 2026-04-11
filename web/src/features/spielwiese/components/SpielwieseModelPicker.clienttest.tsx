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
});

describe("SpielwieseModelPickerPanel chrome", () => {
  it("renders a layered picker shell with divided columns", () => {
    render(
      <SpielwieseModelPickerPanel
        currentModel="GPT-4.1 mini"
        hoveredModelLabel={null}
        onClose={() => {}}
        onValueChange={() => {}}
        providerId="openai"
        setHoveredModelLabel={() => {}}
        setProviderId={() => {}}
        setShowLegacyModels={() => false}
        showLegacyModels={false}
      />,
    );

    const panel = screen.getByRole("dialog", { name: "Model picker" });
    const grid = screen.getByTestId("spielwiese-model-picker-grid");
    const modelColumn = grid.children[1] as HTMLElement | undefined;

    expect(panel.className).toContain("rounded-[20px]");
    expect(panel.className).toContain("bg-[linear-gradient");
    expect(panel.className).toContain("backdrop-blur-xl");
    expect(grid.className).toContain("rounded-[16px]");
    expect(grid.className).toContain("border-[rgba(0,0,0,0.05)]");
    expect(modelColumn?.className).toContain("border-l");
  });
});
