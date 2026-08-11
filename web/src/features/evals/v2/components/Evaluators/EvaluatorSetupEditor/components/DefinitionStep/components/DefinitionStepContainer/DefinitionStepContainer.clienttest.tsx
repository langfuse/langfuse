import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelector/SampleObservationSelector";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { DefinitionStepContainer } from "./DefinitionStepContainer";

const renderSpies = vi.hoisted(() => ({
  codeEditor: vi.fn(),
  codeLanguageSelector: vi.fn(),
  modelPicker: vi.fn(),
  promptEditor: vi.fn(),
  scoreOutput: vi.fn(),
}));

vi.mock("@/src/features/evals/components/code-eval-template-form-body", () => ({
  CodeEvalTemplateFormBody: () => {
    renderSpies.codeEditor();
    return <div>Code editor</div>;
  },
}));

vi.mock(
  "@/src/features/evals/v2/components/Evaluators/Code/EvaluatorCodeLanguageSelector/EvaluatorCodeLanguageSelector",
  () => ({
    EvaluatorCodeLanguageSelector: () => {
      renderSpies.codeLanguageSelector();
      return <div>Code language</div>;
    },
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      batchIO: {
        useQuery: (_input: unknown, options: { enabled: boolean }) => ({
          data: options.enabled ? { input: "sample" } : undefined,
        }),
      },
    },
  },
  sendAsPostOption: {},
}));

vi.mock(
  "@/src/features/evals/v2/components/Evaluators/Judges/PromptVariableEditor/PromptVariableEditor",
  () => ({
    PromptVariableEditor: () => {
      renderSpies.promptEditor();
      return <div>Prompt editor</div>;
    },
  }),
);

vi.mock(
  "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker",
  () => ({
    JudgeModelPicker: () => {
      renderSpies.modelPicker();
      return <div>Model picker</div>;
    },
    JudgeModelPickerTrigger: () => null,
  }),
);

vi.mock(
  "@/src/features/evals/v2/components/Evaluators/Judges/ScoreOutputConfiguration/ScoreOutputConfiguration",
  () => ({
    ScoreOutputConfiguration: () => {
      renderSpies.scoreOutput();
      return <div>Score output</div>;
    },
  }),
);

describe("DefinitionStepContainer", () => {
  it("isolates model and score controls from prompt and sample updates", () => {
    const store = createEvaluatorSetupStore({ initialEvaluator: null });
    const editor = (
      <TooltipProvider>
        <DefinitionStepContainer
          projectId="project-1"
          store={store}
          isEditing={false}
          defaultModel={null}
          providerGroups={[]}
          onStepOpenChange={vi.fn()}
          onConfigureProviders={vi.fn()}
          onConfigureDefault={vi.fn()}
        />
      </TooltipProvider>
    );
    render(editor);
    const initialModelPickerRenders = renderSpies.modelPicker.mock.calls.length;
    const initialScoreOutputRenders = renderSpies.scoreOutput.mock.calls.length;

    act(() => store.getState().actions.setPrompt("Updated prompt"));

    expect(renderSpies.modelPicker).toHaveBeenCalledTimes(
      initialModelPickerRenders,
    );
    expect(renderSpies.scoreOutput).toHaveBeenCalledTimes(
      initialScoreOutputRenders,
    );

    act(() =>
      store.getState().actions.setSelectedObservation({
        id: "observation-1",
        traceId: "trace-1",
        startTime: new Date("2026-08-11T10:00:00.000Z"),
      } as SampleObservation),
    );

    expect(renderSpies.modelPicker).toHaveBeenCalledTimes(
      initialModelPickerRenders,
    );
    expect(renderSpies.scoreOutput).toHaveBeenCalledTimes(
      initialScoreOutputRenders,
    );
  });

  it("isolates prompt and model controls from score-output updates", () => {
    const store = createEvaluatorSetupStore({ initialEvaluator: null });
    render(
      <TooltipProvider>
        <DefinitionStepContainer
          projectId="project-1"
          store={store}
          isEditing={false}
          defaultModel={null}
          providerGroups={[]}
          onStepOpenChange={vi.fn()}
          onConfigureProviders={vi.fn()}
          onConfigureDefault={vi.fn()}
        />
      </TooltipProvider>,
    );
    const initialModelPickerRenders = renderSpies.modelPicker.mock.calls.length;
    const initialPromptEditorRenders =
      renderSpies.promptEditor.mock.calls.length;
    const initialScoreOutputRenders = renderSpies.scoreOutput.mock.calls.length;

    act(() =>
      store.getState().actions.setScoreOutput({
        ...store.getState().scoreOutput,
        scoreDescription: "Updated score description",
      }),
    );

    expect(renderSpies.scoreOutput.mock.calls.length).toBeGreaterThan(
      initialScoreOutputRenders,
    );
    expect(renderSpies.modelPicker).toHaveBeenCalledTimes(
      initialModelPickerRenders,
    );
    expect(renderSpies.promptEditor).toHaveBeenCalledTimes(
      initialPromptEditorRenders,
    );
  });

  it("isolates the language selector from source-code updates", () => {
    const store = createEvaluatorSetupStore({ initialEvaluator: null });
    store.getState().actions.setType("CODE");
    render(
      <TooltipProvider>
        <DefinitionStepContainer
          projectId="project-1"
          store={store}
          isEditing={false}
          defaultModel={null}
          providerGroups={[]}
          onStepOpenChange={vi.fn()}
          onConfigureProviders={vi.fn()}
          onConfigureDefault={vi.fn()}
        />
      </TooltipProvider>,
    );
    const initialCodeEditorRenders = renderSpies.codeEditor.mock.calls.length;
    const initialLanguageSelectorRenders =
      renderSpies.codeLanguageSelector.mock.calls.length;

    act(() => store.getState().actions.setSourceCode("return { score: 1 };"));

    expect(renderSpies.codeEditor.mock.calls.length).toBeGreaterThan(
      initialCodeEditorRenders,
    );
    expect(renderSpies.codeLanguageSelector).toHaveBeenCalledTimes(
      initialLanguageSelectorRenders,
    );
  });
});
