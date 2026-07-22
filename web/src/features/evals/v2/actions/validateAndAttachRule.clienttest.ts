import { validateAndAttachRule } from "./validateAndAttachRule";

const evaluator = {
  scoreName: "Quality",
  targetObject: "event",
  variableMapping: [
    {
      templateVariable: "input",
      selectedColumnId: "input",
      jsonSelector: null,
    },
  ],
  evalTemplate: {
    id: "template-1",
    type: "LLM_AS_JUDGE",
    prompt: "Judge {{input}}",
    sourceCode: null,
    sourceCodeLanguage: null,
    provider: null,
    model: null,
    modelParams: null,
    outputDefinition: null,
  },
};

function dependencies() {
  return {
    getEvaluator: vi.fn().mockResolvedValue(evaluator),
    getEvaluationRule: vi
      .fn()
      .mockResolvedValue({ filter: [], targetObject: "event" }),
    getSample: vi.fn().mockResolvedValue({
      id: "observation-1",
      traceId: "trace-1",
      startTime: new Date("2026-07-20T08:00:00.000Z"),
    }),
    runLlmTest: vi.fn().mockResolvedValue({ success: true }),
    runCodeTest: vi.fn().mockResolvedValue({ success: true }),
    attach: vi.fn().mockResolvedValue(undefined),
    captureValidation: vi.fn(),
  };
}

describe("validateAndAttachRule", () => {
  it("test-runs an LLM evaluator on a matching observation before attaching", async () => {
    const deps = dependencies();

    await expect(validateAndAttachRule("project-1", deps)).resolves.toEqual({
      attached: true,
    });

    expect(deps.getSample).toHaveBeenCalledWith([]);
    expect(deps.runLlmTest).toHaveBeenCalledWith({
      projectId: "project-1",
      prompt: "Judge {{input}}",
      provider: null,
      model: null,
      modelParams: null,
      outputDefinition: null,
      mapping: evaluator.variableMapping,
      observationId: "observation-1",
      traceId: "trace-1",
      observationStartTime: new Date("2026-07-20T08:00:00.000Z"),
    });
    expect(deps.attach).toHaveBeenCalledOnce();
    expect(deps.captureValidation).toHaveBeenCalledOnce();
    expect(deps.captureValidation).toHaveBeenCalledWith({
      outcome: "passed",
      evaluatorType: "LLM_AS_JUDGE",
    });
  });

  it("does not let analytics failures block a validated attachment", async () => {
    const deps = dependencies();
    deps.captureValidation.mockImplementation(() => {
      throw new Error("PostHog unavailable");
    });

    await expect(validateAndAttachRule("project-1", deps)).resolves.toEqual({
      attached: true,
    });
    expect(deps.attach).toHaveBeenCalledOnce();
  });

  it("keeps an LLM evaluator detached when a prompt variable is unmapped", async () => {
    const deps = dependencies();
    deps.getEvaluator.mockResolvedValue({
      ...evaluator,
      variableMapping: [],
    });

    await expect(validateAndAttachRule("project-1", deps)).resolves.toEqual({
      attached: false,
      outcome: "failed",
      message:
        "Please complete all prompt variable mappings before attaching this evaluator to the evaluation rule.",
    });

    expect(deps.attach).not.toHaveBeenCalled();
    expect(deps.captureValidation).toHaveBeenCalledWith({
      outcome: "failed",
      evaluatorType: "LLM_AS_JUDGE",
    });
  });

  it("attaches without test-running when no observation matches", async () => {
    const deps = dependencies();
    deps.getSample.mockResolvedValue(null);

    const result = await validateAndAttachRule("project-1", deps);

    expect(result).toEqual({ attached: true });
    expect(deps.runLlmTest).not.toHaveBeenCalled();
    expect(deps.attach).toHaveBeenCalledOnce();
    expect(deps.captureValidation).toHaveBeenCalledWith({
      outcome: "unavailable",
      evaluatorType: "LLM_AS_JUDGE",
    });
  });

  it("leaves unsupported rule rules detached for manual review", async () => {
    const deps = dependencies();
    deps.getEvaluator.mockResolvedValue({
      ...evaluator,
      targetObject: "experiment",
    });
    deps.getEvaluationRule.mockResolvedValue({
      filter: [],
      targetObject: "experiment",
    });

    await expect(validateAndAttachRule("project-1", deps)).resolves.toEqual({
      attached: false,
      outcome: "unavailable",
      message:
        "Automatic validation is currently available for observation rules only. The evaluator was not attached to the evaluation rule.",
    });
    expect(deps.getSample).not.toHaveBeenCalled();
    expect(deps.attach).not.toHaveBeenCalled();
  });

  it("uses the saved code evaluator definition for validation", async () => {
    const deps = dependencies();
    deps.getEvaluator.mockResolvedValue({
      ...evaluator,
      variableMapping: [],
      evalTemplate: {
        ...evaluator.evalTemplate,
        type: "CODE",
        prompt: null,
        sourceCode: "def evaluate(ctx): return 1",
        sourceCodeLanguage: "PYTHON",
      },
    });

    await expect(validateAndAttachRule("project-1", deps)).resolves.toEqual({
      attached: true,
    });

    expect(deps.runCodeTest).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        sourceCode: "def evaluate(ctx): return 1",
        sourceCodeLanguage: "PYTHON",
      }),
    );
    expect(deps.attach).toHaveBeenCalledOnce();
  });
});
