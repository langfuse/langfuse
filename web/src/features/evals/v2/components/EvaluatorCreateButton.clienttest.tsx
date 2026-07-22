import { fireEvent, render, screen } from "@testing-library/react";

import { EvaluatorCreateButton } from "@/src/features/evals/v2/components/EvaluatorCreateButton";

function openCreationMenu() {
  fireEvent.keyDown(screen.getByRole("button", { name: "New evaluator" }), {
    key: "Enter",
  });
}

describe("EvaluatorCreateButton", () => {
  it("offers AI second and routes each creation path", () => {
    const onCreateWithAi = vi.fn();
    const onStartFromTemplate = vi.fn();
    const onStartFromScratch = vi.fn();

    render(
      <EvaluatorCreateButton
        hasWriteAccess
        canUseAssistant
        onCreateWithAi={onCreateWithAi}
        onStartFromTemplate={onStartFromTemplate}
        onStartFromScratch={onStartFromScratch}
      />,
    );

    openCreationMenu();

    const menuItems = screen.getAllByRole("menuitem");
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "Start from exampleBrowse ready-to-use evaluator examples",
      "Create with AIUse the assistant to turn data insights into an evaluator",
      "Start from scratchConfigure a new evaluator yourself",
    ]);

    fireEvent.click(menuItems[1]);
    expect(onCreateWithAi).toHaveBeenCalledOnce();

    openCreationMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /example/i }));
    expect(onStartFromTemplate).toHaveBeenCalledOnce();

    openCreationMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /scratch/i }));
    expect(onStartFromScratch).toHaveBeenCalledOnce();
  });

  it("omits the AI path when the assistant is unavailable", () => {
    render(
      <EvaluatorCreateButton
        hasWriteAccess
        canUseAssistant={false}
        onCreateWithAi={vi.fn()}
        onStartFromTemplate={vi.fn()}
        onStartFromScratch={vi.fn()}
      />,
    );

    openCreationMenu();

    expect(
      screen.queryByRole("menuitem", { name: /create with ai/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });
});
