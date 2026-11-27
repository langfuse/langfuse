/* eslint-disable @repo/prefer-stories-over-client-tests */
import { fireEvent, render, screen } from "@testing-library/react";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { EvaluationRulePicker } from "@/src/features/evals/v2/components/Rules/EvaluationRulePicker/EvaluationRulePicker";
import { EvaluatorSavedDialog } from "./EvaluatorSavedDialog";

const renderDialog = () => {
  const onDismiss = vi.fn();
  const onSecondaryAction = vi.fn();
  const onModeChange = vi.fn();

  render(
    <TooltipProvider>
      <EvaluatorSavedDialog
        open
        mode="test-filters"
        modeContentByMode={{
          "test-filters": null,
          "different-scope": null,
        }}
        backfillContent={null}
        costSummary={null}
        canSubmit
        isSubmitting={false}
        primaryActionLabel="Execute"
        onModeChange={onModeChange}
        onDismiss={onDismiss}
        onSecondaryAction={onSecondaryAction}
        onPrimaryAction={vi.fn()}
      />
    </TooltipProvider>,
  );

  return { onDismiss, onSecondaryAction, onModeChange };
};

describe("EvaluatorSavedDialog", () => {
  it("selects an inactive mode when its card is clicked", () => {
    const { onModeChange } = renderDialog();

    fireEvent.click(
      screen.getByText(
        "Attach to a rule you already have, or create a new one.",
      ),
    );

    expect(onModeChange).toHaveBeenCalledWith("different-scope");
  });

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

  it("blocks rule names from session replay, including the portaled rule list", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <TooltipProvider>
        <EvaluatorSavedDialog
          open
          mode="different-scope"
          modeContentByMode={{
            "test-filters": null,
            "different-scope": (
              <EvaluationRulePicker
                open
                disabledRules={[]}
                availableRules={[{ id: "rule-1", name: "Listed rule name" }]}
                onSelectAvailableRule={vi.fn()}
              >
                {() => <PopoverTrigger>Selected rule name</PopoverTrigger>}
              </EvaluationRulePicker>
            ),
          }}
          costSummary={null}
          canSubmit
          isSubmitting={false}
          primaryActionLabel="Execute"
          onModeChange={vi.fn()}
          onDismiss={vi.fn()}
          onSecondaryAction={vi.fn()}
          onPrimaryAction={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByText("Selected rule name").closest(".ph-no-capture"),
    ).not.toBeNull();
    expect(
      screen.getByText("Listed rule name").closest(".ph-no-capture"),
    ).not.toBeNull();
  });
});
