import { fireEvent, render, screen } from "@testing-library/react";
import {
  SpielwieseVariablesPanel,
  SpielwieseVariablesSummary,
} from "./SpielwieseVariablesPanel";
import { useSpielwieseVariablesPanelState } from "./useSpielwieseVariablesPanelState";

const variablesPanel = {
  countLabel: "1 variable",
  actionLabel: "Add variable",
  items: [
    {
      id: "food",
      label: "Food",
      helper: "This is about food.",
      isActive: true,
      tone: "green" as const,
    },
  ],
};

function renderVariablesPanel() {
  function TestVariablesPanel() {
    const state = useSpielwieseVariablesPanelState(variablesPanel.items);

    return (
      <div>
        <SpielwieseVariablesSummary
          actionLabel={variablesPanel.actionLabel}
          count={state.items.length}
          onCreate={state.onCreate}
        />
        <SpielwieseVariablesPanel state={state} />
      </div>
    );
  }

  render(<TestVariablesPanel />);
}

describe("SpielwieseVariablesPanel", () => {
  it("renders the variable count header and action button", () => {
    renderVariablesPanel();

    expect(screen.getByText(variablesPanel.countLabel)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: variablesPanel.actionLabel }),
    ).toBeTruthy();
  });

  it("renders editable fields for existing variables", () => {
    renderVariablesPanel();

    expect(screen.getByDisplayValue("Food")).toBeTruthy();
    expect(screen.getByDisplayValue("This is about food.")).toBeTruthy();
  });

  it("keeps the active variable card tinted while editing", () => {
    renderVariablesPanel();

    expect(
      screen.getByTestId("spielwiese-variable-editor").className,
    ).toContain("bg-light-green/70");
  });
});

describe("SpielwieseVariablesPanel editing", () => {
  it("adds a new editable variable row", () => {
    renderVariablesPanel();

    fireEvent.click(
      screen.getByRole("button", { name: variablesPanel.actionLabel }),
    );

    expect(screen.getByText("2 variables")).toBeTruthy();
    expect(screen.getAllByLabelText(/Variable name/).length).toBe(2);
  });

  it("edits an existing variable directly", () => {
    renderVariablesPanel();

    fireEvent.change(screen.getByLabelText("Variable name food"), {
      target: { value: "Meal type" },
    });
    fireEvent.change(screen.getByLabelText("Variable helper food"), {
      target: { value: "Breakfast, lunch, dinner, or snack." },
    });

    expect(screen.getByDisplayValue("Meal type")).toBeTruthy();
    expect(
      screen.getByDisplayValue("Breakfast, lunch, dinner, or snack."),
    ).toBeTruthy();
  });

  it("deletes a variable directly from the row", () => {
    renderVariablesPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete variable food" }),
    );

    expect(screen.getByText("0 variables")).toBeTruthy();
    expect(screen.queryByDisplayValue("Food")).toBeNull();
  });
});
