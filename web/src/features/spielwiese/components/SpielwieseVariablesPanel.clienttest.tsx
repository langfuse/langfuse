import { fireEvent, render, screen } from "@testing-library/react";
import {
  SpielwieseVariablesPanel,
  SpielwieseVariablesSummary,
} from "./SpielwieseVariablesPanel";
import { getSpielwieseToneStyles } from "./spielwieseToneStyles";
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

function expectEditorTone(editorIndex: number, toneIndex: number) {
  const editor = screen.getAllByTestId("spielwiese-variable-editor")[
    editorIndex
  ]!;
  const surface = screen.getAllByTestId("spielwiese-variable-editor-surface")[
    editorIndex
  ]!;
  const tone = getSpielwieseToneStyles(toneIndex);
  const nameField = screen.getAllByLabelText(/Variable name/)[editorIndex]!;
  const helperField = screen.getAllByLabelText(/Variable helper/)[editorIndex]!;

  expect(editor.className).toContain("[--variable-shell-gap:2px]");
  expect(editor.className).toContain("rounded-[var(--variable-shell-radius)]");
  expect(editor.style.getPropertyValue("--variable-shell-fill")).toBe(
    tone.shellFill,
  );
  expect(editor.style.getPropertyValue("--variable-surface-fill")).toBe(
    tone.surfaceFill,
  );
  expect(editor.style.getPropertyValue("--variable-field-fill")).toBe(
    tone.fill,
  );
  expect(editor.style.getPropertyValue("--variable-accent")).toBe(tone.accent);
  expect(editor.className).not.toContain("shadow-[");
  expect(surface.className).toContain(
    "rounded-[calc(var(--variable-shell-radius)-var(--variable-shell-gap))]",
  );
  expect(surface.className).toContain(
    "[background-color:var(--variable-surface-fill)]",
  );
  expect(nameField.className).toContain(
    "[background-color:var(--variable-field-fill)]",
  );
  expect(nameField.className).toContain("text-foreground");
  expect(nameField.className).toContain("shadow-none");
  expect(helperField.className).toContain(
    "[background-color:var(--variable-field-fill)]",
  );
  expect(helperField.className).toContain("text-foreground");
  expect(helperField.className).toContain("shadow-none");
}

function expectVariablesSummaryChrome() {
  const summary = screen.getByTestId("spielwiese-variables-summary");
  const iconShell = screen.getByTestId(
    "spielwiese-variables-summary-icon-shell",
  );
  const action = screen.getByTestId("spielwiese-variables-summary-action");

  expect(summary.className).toContain("items-center");
  expect(summary.className).toContain("justify-between");
  expect(iconShell.className).toContain("size-7");
  expect(iconShell.className).toContain("rounded-[10px]");
  expect(iconShell.className).toContain("bg-white/72");
  expect(iconShell.className).toContain("text-foreground/52");
  expect(action.className).toContain("size-7");
  expect(action.className).toContain("rounded-[10px]");
  expect(action.className).toContain("border-0");
  expect(action.className).toContain("bg-transparent");
  expect(action.className).toContain("hover:bg-black/[0.06]");
}

describe("SpielwieseVariablesPanel", () => {
  it("renders the variable count header and action button", () => {
    renderVariablesPanel();

    expect(screen.getByText(variablesPanel.countLabel)).toBeTruthy();
    expectVariablesSummaryChrome();
  });

  it("renders editable fields for existing variables", () => {
    renderVariablesPanel();

    expect(screen.getByDisplayValue("Food")).toBeTruthy();
    expect(screen.getByDisplayValue("This is about food.")).toBeTruthy();
  });

  it("keeps the active variable card tinted while editing", () => {
    renderVariablesPanel();

    expectEditorTone(0, 0);
  });
});

describe("SpielwieseVariablesPanel editing", () => {
  it("adds a new editable variable row", () => {
    renderVariablesPanel();

    fireEvent.click(
      screen.getByRole("button", { name: variablesPanel.actionLabel }),
    );
    const secondTone = getSpielwieseToneStyles(1);

    expect(screen.getByText("2 variables")).toBeTruthy();
    expect(screen.getAllByLabelText(/Variable name/).length).toBe(2);
    expect(
      screen.getAllByPlaceholderText(
        "Add a sample value so you can test the prompt with it.",
      ).length,
    ).toBe(2);
    expectEditorTone(1, 1);
    expect(
      screen
        .getAllByTestId("spielwiese-variable-editor")[1]
        ?.style.getPropertyValue("--variable-shell-fill"),
    ).toBe(secondTone.shellFill);
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
