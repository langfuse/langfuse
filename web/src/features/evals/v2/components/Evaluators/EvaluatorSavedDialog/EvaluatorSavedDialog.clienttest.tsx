import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { EvaluatorSavedDialog } from "./EvaluatorSavedDialog";

const renderDialog = () => {
  const onDismiss = vi.fn();
  const onSecondaryAction = vi.fn();

  render(
    <TooltipProvider>
      <EvaluatorSavedDialog
        open
        mode="test-filters"
        modeContentByMode={{
          "test-filters": null,
          "different-scope": null,
        }}
        costSummary={null}
        canSubmit
        isSubmitting={false}
        primaryActionLabel="Execute"
        onModeChange={vi.fn()}
        onDismiss={onDismiss}
        onSecondaryAction={onSecondaryAction}
        onPrimaryAction={vi.fn()}
      />
    </TooltipProvider>,
  );

  return { onDismiss, onSecondaryAction };
};

describe("EvaluatorSavedDialog", () => {
  it("treats the close button as a passive dismissal", () => {
    const { onDismiss, onSecondaryAction } = renderDialog();

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onSecondaryAction).not.toHaveBeenCalled();
  });

  it("treats Skip execution as an explicit secondary action", () => {
    const { onDismiss, onSecondaryAction } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Skip execution" }));

    expect(onSecondaryAction).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
