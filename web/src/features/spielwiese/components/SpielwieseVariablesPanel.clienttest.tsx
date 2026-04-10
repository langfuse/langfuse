import { render, screen } from "@testing-library/react";
import { SpielwieseVariablesPanel } from "./SpielwieseVariablesPanel";

describe("SpielwieseVariablesPanel", () => {
  const variablesPanel = {
    countLabel: "3 variables",
    actionLabel: "Add variable",
    items: [
      {
        id: "food",
        label: "A very long variable label that should stay on one line",
        helper: "This is about food.",
        isActive: true,
        tone: "green" as const,
      },
    ],
  };

  it("renders the variable count header and action button", () => {
    render(<SpielwieseVariablesPanel variablesPanel={variablesPanel} />);

    expect(screen.getByText(variablesPanel.countLabel)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: variablesPanel.actionLabel }),
    ).toBeTruthy();
  });

  it("renders variable labels with truncate", () => {
    render(<SpielwieseVariablesPanel variablesPanel={variablesPanel} />);

    const label = screen.getByText(variablesPanel.items[0].label);
    expect(label.className).toContain("truncate");
  });
});
