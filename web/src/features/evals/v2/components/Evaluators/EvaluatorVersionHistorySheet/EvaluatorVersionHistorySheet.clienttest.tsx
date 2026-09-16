import { fireEvent, render, screen } from "@testing-library/react";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { EvaluatorVersionHistorySheet } from "./EvaluatorVersionHistorySheet";
import type { EvaluatorVersion } from "./types";

const currentVersion = {
  id: "version-2",
  version: 2,
  createdAt: new Date(),
  type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
  sourceCode: null,
  sourceCodeLanguage: null,
  promptMessages: [{ role: "user" as const, content: "Current prompt" }],
  provider: "openai",
  model: "gpt-4.1-mini",
  modelParams: null,
  vars: [],
  variableMapping: null,
  outputDefinition: null,
  createdByUser: { name: "Ada Lovelace", email: "ada@example.com" },
} satisfies EvaluatorVersion;

const oldVersion = {
  ...currentVersion,
  id: "version-1",
  version: 1,
  promptMessages: [{ role: "user" as const, content: "Old prompt" }],
};

describe("EvaluatorVersionHistorySheet", () => {
  it("keeps version interactions local and confirms before restoring", () => {
    const onRestoreVersion = vi.fn();
    const onOpenChange = vi.fn();
    const onVersionExpansionChange = vi.fn();

    render(
      <TooltipProvider>
        <EvaluatorVersionHistorySheet
          open
          onOpenChange={onOpenChange}
          evaluatorName="Answer quality"
          versions={[currentVersion, oldVersion]}
          currentVersionId={currentVersion.id}
          defaultModel={null}
          onVersionExpansionChange={onVersionExpansionChange}
          onRestoreVersion={onRestoreVersion}
          isLoading={false}
          hasMore={false}
          isLoadingMore={false}
          onLoadMore={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Version 1").parentElement).toHaveClass(
      "items-baseline",
    );
    expect(
      screen.queryByRole("button", { name: "Restore version 2" }),
    ).not.toBeInTheDocument();

    const oldVersionTrigger = screen.getByTitle(
      "Show the definition saved as version 1",
    );
    fireEvent.click(oldVersionTrigger);
    expect(oldVersionTrigger).toHaveAttribute("aria-expanded", "true");
    expect(onVersionExpansionChange).toHaveBeenCalledWith(oldVersion.id);

    fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));

    expect(onRestoreVersion).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        `This will replace the current evaluator definition with version 1. It won't be saved until you click "Save changes".`,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Evaluator versions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore version" }));

    expect(onRestoreVersion).toHaveBeenCalledWith(oldVersion);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
