import { fireEvent, render, screen } from "@testing-library/react";

const defaultModelQueryMock = vi.fn(() => ({ data: undefined }));
const createTemplateMutateAsyncMock = vi.fn();

vi.mock("@/src/utils/api", () => ({
  api: {
    defaultLlmModel: {
      fetchDefaultModel: { useQuery: () => defaultModelQueryMock() },
    },
    evals: {
      createTemplate: {
        useMutation: () => ({
          mutateAsync: createTemplateMutateAsyncMock,
          isPending: false,
        }),
      },
      allTemplates: { useQuery: () => ({ data: undefined }) },
    },
    useUtils: () => ({ models: { invalidate: vi.fn() } }),
  },
  reportTrpcErrorWithoutToast: vi.fn(),
}));

vi.mock("next/router", () => ({ default: { push: vi.fn() } }));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/playground/page/hooks/useModelParams", () => ({
  useModelParams: () => ({
    modelParams: {
      provider: { value: "", enabled: true },
      model: { value: "", enabled: true },
    },
    setModelParams: vi.fn(),
    updateModelParamValue: vi.fn(),
    setModelParamEnabled: vi.fn(),
    availableModels: [],
    providerModelCombinations: [],
    availableProviders: [],
  }),
}));

vi.mock("@/src/features/evals/hooks/useEvaluationModel", () => ({
  useEvaluationModel: vi.fn(),
}));

vi.mock("@/src/features/evals/hooks/useValidateCustomModel", () => ({
  useValidateCustomModel: () => ({ isCustomModelValid: true }),
}));

vi.mock("@/src/features/evals/hooks/useIsCodeEvalEnabled", () => ({
  useIsCodeEvalEnabled: () => ({ enabled: false, isLoading: false }),
}));

vi.mock("@/src/features/evals/hooks/useEvalCapabilities", () => ({
  useEvalCapabilities: () => ({
    isNewCompatible: true,
    compatibilityCheckWasPerformed: false,
    allowLegacy: true,
    isLoading: false,
    hasLegacyEvals: false,
    forceV3Experience: false,
  }),
}));

vi.mock("@/src/features/evals/hooks/useCodeEvalSourceValidation", () => ({
  useCodeEvalSourceValidation: () => ({
    isValid: true,
    isPending: false,
    validationResult: undefined,
    validate: vi.fn(async () => true),
    reset: vi.fn(),
  }),
}));

vi.mock("@/src/components/ModelParameters", () => ({
  ModelParameters: () => <div data-testid="model-parameters" />,
}));

vi.mock("@/src/components/editor", () => ({
  CodeMirrorEditor: () => null,
}));

vi.mock("@/src/features/evals/utils/code-eval-template-validation", () => ({
  getCodeEvalSourceForEditor: ({ sourceCode }: { sourceCode: string }) =>
    sourceCode,
  getDefaultCodeEvalSource: () => "",
  formatAndStripCodeEvalSourceForSubmit: vi.fn(async () => ""),
}));

vi.mock("@/src/features/evals/components/code-eval-template-form-body", () => ({
  CodeEvalTemplateFormBody: () => null,
}));

vi.mock("@/src/features/evals/components/eval-template-type-selector", () => ({
  EvalTemplateTypeSelector: () => null,
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

import { EvalTemplateForm } from "./template-form";

const validPreFill = {
  name: "my-evaluator",
  prompt: "Rate the response {{input}}",
  vars: [],
};

describe("EvalTemplateForm model configuration feedback", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("announces save-blocking errors in an alert region", async () => {
    defaultModelQueryMock.mockReturnValue({ data: undefined });

    render(
      <EvalTemplateForm
        projectId="project-1"
        useDialog={false}
        isEditing
        preFilledFormValues={validPreFill}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no default evaluation model set/i);
  });

  it("shows the active model source as a checked radio option", () => {
    render(
      <EvalTemplateForm
        projectId="project-1"
        useDialog={false}
        isEditing={false}
        preFilledFormValues={{ ...validPreFill, shouldUseDefaultModel: false }}
      />,
    );

    expect(
      screen.getByRole("radio", { name: /custom model/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: /default evaluation model/i }),
    ).toHaveAttribute("aria-checked", "false");
  });
});
