import {
  EvalTargetObject,
  TopicsTargetObject,
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  type FilterState,
} from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { getDefaultCodeEvalSource } from "@/src/features/evals/utils/code-eval-template-starter-examples";
import {
  TRACE_TRANSCRIPT_DEFAULT_FIELD,
  variableFieldsForTarget,
} from "@/src/features/evals/v2/fns/rules/traceTranscriptAssignments";
import {
  createEvaluatorSetupStore,
  selectHasValidModel,
} from "./evaluatorSetupStore";
import type { NormalizedEvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

describe("createEvaluatorSetupStore", () => {
  it("starts new evaluator descriptions empty", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });

    expect(store.getState().scoreOutput).toMatchObject({
      scoreDescription: "",
      reasoningDescription: "",
    });
  });

  it("reorders prompt messages and keeps the final message", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { actions } = store.getState();

    actions.setPromptMessage(0, { role: "system", content: "Rubric" });
    actions.addPromptMessage();
    actions.setPromptMessage(1, { role: "user", content: "Case" });
    actions.reorderPromptMessage(1, 0);

    expect(store.getState().promptMessages).toEqual([
      { role: "user", content: "Case" },
      { role: "system", content: "Rubric" },
    ]);
    expect(store.getState().promptMessageIds).toHaveLength(2);

    actions.removePromptMessage(0);
    actions.removePromptMessage(0);
    expect(store.getState().promptMessages).toEqual([
      { role: "system", content: "Rubric" },
    ]);
  });

  it("keeps prompt messages and code drafts when switching evaluator type", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { actions } = store.getState();

    actions.setPromptMessage(0, {
      role: "user",
      content: "Judge {{output}}",
    });
    actions.setSourceCode("return { score: 1 };");
    actions.setType("CODE");
    actions.setType("LLM_AS_JUDGE");

    expect(store.getState()).toMatchObject({
      type: "LLM_AS_JUDGE",
      promptMessages: [{ role: "user", content: "Judge {{output}}" }],
      sourceCode: "return { score: 1 };",
    });
  });

  it("resets variable mappings to the defaults of a new test target", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { actions } = store.getState();
    actions.setPromptMessage(0, {
      role: "user",
      content: "Judge {{input}} {{output}}",
    });
    actions.setVariableField("output", {
      selectedColumnId: "metadata",
      jsonSelector: "$.answer",
    });

    actions.setTargetObject(TopicsTargetObject);
    expect(store.getState().variableFields).toEqual({
      input: TRACE_TRANSCRIPT_DEFAULT_FIELD,
      output: TRACE_TRANSCRIPT_DEFAULT_FIELD,
    });

    actions.setTargetObject(EvalTargetObject.EVENT);
    expect(store.getState().variableFields).toEqual({});
  });

  it("swaps an unedited starter prompt for the one of a new test target", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { actions } = store.getState();
    const starter = store.getState().promptMessages;

    actions.setTargetObject(TopicsTargetObject);
    expect(store.getState().promptMessages[0]?.content).toContain(
      "{{messages}}",
    );
    expect(store.getState().variableFields).toEqual({
      messages: TRACE_TRANSCRIPT_DEFAULT_FIELD,
    });

    actions.setTargetObject(EvalTargetObject.EVENT);
    expect(store.getState().promptMessages).toEqual(starter);

    const edited = { role: "user" as const, content: "Judge {{output}}" };
    actions.setPromptMessage(0, edited);
    actions.setTargetObject(TopicsTargetObject);
    expect(store.getState().promptMessages).toEqual([edited]);
  });

  it("maps the variables of a new evaluator type to the transcript on trace messages", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { actions } = store.getState();
    actions.setTargetObject(TopicsTargetObject);

    actions.setType("DECISION_MODEL");
    expect(store.getState().variableFields).toEqual({
      input: TRACE_TRANSCRIPT_DEFAULT_FIELD,
      output: TRACE_TRANSCRIPT_DEFAULT_FIELD,
    });

    actions.setType("LLM_AS_JUDGE");
    expect(store.getState().variableFields).toEqual({
      messages: TRACE_TRANSCRIPT_DEFAULT_FIELD,
    });
  });

  it("opens a trace-only evaluator on trace messages without rewriting its stored mapping", () => {
    const definition = {
      type: "LLM_AS_JUDGE" as const,
      promptMessages: [
        { role: "user" as const, content: "{{threads}} {{input}}" },
      ],
      provider: null,
      model: null,
      modelParams: null,
      vars: ["threads", "input"],
      variableMapping: [
        {
          templateVariable: "threads",
          selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
          jsonSelector: "$[1].messages",
        },
        { templateVariable: "input", selectedColumnId: "input" },
      ],
      outputDefinition: {
        version: 1,
        score: { dataType: "NUMERIC", description: "Score" },
        reasoning: { description: "Reasoning" },
      },
    } as unknown as NormalizedEvaluatorDefinition;
    const evaluator = { name: "Trace judge", description: null, definition };
    const storedFields = {
      threads: {
        selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
        jsonSelector: "$[1].messages",
      },
      input: { selectedColumnId: "input", jsonSelector: null },
    };

    const store = createEvaluatorSetupStore({
      initialEvaluator: evaluator,
      initialTargetObject: TopicsTargetObject,
      mode: "edit",
    });
    expect(store.getState().targetObject).toBe(TopicsTargetObject);
    expect(store.getState().variableFields).toEqual(storedFields);
    expect(
      variableFieldsForTarget(
        TopicsTargetObject,
        store.getState().variableFields,
      ),
    ).toEqual({
      threads: storedFields.threads,
      input: TRACE_TRANSCRIPT_DEFAULT_FIELD,
    });

    store.getState().actions.applyDefinition(definition);
    expect(store.getState().variableFields).toEqual(storedFields);

    const withoutTarget = createEvaluatorSetupStore({
      initialEvaluator: evaluator,
      mode: "edit",
    });
    expect(withoutTarget.getState().targetObject).toBe(EvalTargetObject.EVENT);
  });

  it("initializes an existing code evaluator", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "Has output",
        description: "Checks for output",
        definition: {
          type: "CODE",
          sourceCode: "return { score: output ? 1 : 0 };",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      },
      mode: "edit",
    });

    expect(store.getState()).toMatchObject({
      type: "CODE",
      name: "Has output",
      description: "Checks for output",
      sourceCode: "return { score: output ? 1 : 0 };",
      sourceCodeLanguage: "TYPESCRIPT",
      sampleFilter: [
        {
          column: "isRootObservation",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ],
    });
  });

  it("leaves variables of a legacy trace or dataset mapping unmapped", () => {
    const legacyMapping = [
      {
        templateVariable: "output",
        langfuseObject: "trace",
        selectedColumnId: "output",
      },
      {
        templateVariable: "expected",
        langfuseObject: "dataset_item",
        selectedColumnId: "expected_output",
      },
    ];
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "Correctness",
        description: "Compares the answer to the expected output",
        definition: {
          type: "LLM_AS_JUDGE",
          promptMessages: [
            { role: "user", content: "Judge {{output}} against {{expected}}" },
          ],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["output", "expected"],
          variableMapping: legacyMapping,
          outputDefinition: {
            dataType: "NUMERIC",
            score: { description: "Correctness" },
            reasoning: { description: "Explain the score" },
          },
        },
      },
      mode: "edit",
    });

    expect(store.getState().variableFields).toEqual({
      output: { selectedColumnId: null, jsonSelector: null },
      expected: { selectedColumnId: null, jsonSelector: null },
    });
  });

  it("prefills an existing evaluator from its first assigned rule", () => {
    const initialSampleFilter = [
      {
        column: "type",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["GENERATION"],
      },
    ];
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "Generation evaluator",
        description: null,
        definition: {
          type: "CODE",
          sourceCode: "return { score: 1 };",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      },
      initialSampleFilter,
      mode: "edit",
    });

    expect(store.getState().sampleFilter).toBe(initialSampleFilter);
  });

  it("preserves an explicitly empty filter from an assigned rule", () => {
    const initialSampleFilter: FilterState = [];
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "All observations evaluator",
        description: null,
        definition: {
          type: "CODE",
          sourceCode: "return { score: 1 };",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      },
      initialSampleFilter,
      mode: "edit",
    });

    expect(store.getState().sampleFilter).toBe(initialSampleFilter);
  });

  it("starts a blank code evaluator from the gallery", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });

    expect(store.getState()).toMatchObject({
      type: "CODE",
      sourceCodeLanguage: "TYPESCRIPT",
      sourceCode: getDefaultCodeEvalSource("TYPESCRIPT"),
    });
  });

  it("keeps separate starter drafts for TypeScript and Python", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });

    store.getState().actions.setSourceCodeLanguage("PYTHON");
    expect(store.getState().sourceCode).toBe(
      getDefaultCodeEvalSource("PYTHON"),
    );

    store.getState().actions.setSourceCode("def evaluate(ctx):\n  return []");
    store.getState().actions.setSourceCodeLanguage("TYPESCRIPT");
    expect(store.getState().sourceCode).toBe(
      getDefaultCodeEvalSource("TYPESCRIPT"),
    );

    store.getState().actions.setSourceCodeLanguage("PYTHON");
    expect(store.getState().sourceCode).toBe("def evaluate(ctx):\n  return []");
  });

  it("keeps sample filters available for the rule creation handoff", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const sampleFilter = [
      {
        column: "type",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["GENERATION"],
      },
    ];

    store.getState().actions.setSampleFilter(sampleFilter);

    expect(store.getState().sampleFilter).toBe(sampleFilter);
  });

  it("prefills sample filters for new evaluators", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });

    expect(store.getState().sampleFilter).toEqual([
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ]);
  });

  it("derives whether any usable model is available", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });

    expect(selectHasValidModel(store.getState())).toBe(false);

    store
      .getState()
      .actions.setDefaultModel({ provider: "OpenAI", model: "gpt-4.1-mini" });
    expect(selectHasValidModel(store.getState())).toBe(true);

    store.getState().actions.setDefaultModel(null);
    store
      .getState()
      .actions.selectModel({ provider: "OpenAI", model: "gpt-4.1" });
    expect(selectHasValidModel(store.getState())).toBe(true);

    store.getState().actions.setType("CODE");
    expect(selectHasValidModel(store.getState())).toBe(true);
  });

  it("keeps configured parameters for the selected model and resets them when the model changes", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { actions } = store.getState();

    actions.configureModel(
      { provider: "OpenAI", model: "gpt-4.1-mini" },
      { temperature: 0.2 },
    );
    actions.selectModel({ provider: "OpenAI", model: "gpt-4.1-mini" });
    expect(store.getState().modelParams).toEqual({ temperature: 0.2 });

    actions.selectModel({ provider: "OpenAI", model: "gpt-4.1" });
    expect(store.getState().modelParams).toBeNull();
  });

  it("loads an old LLM definition without replacing evaluator metadata", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: {
        name: "Answer quality",
        description: "Checks answer quality",
        definition: {
          type: "CODE",
          sourceCode: "return { score: 1 };",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      },
      mode: "edit",
    });
    const sampleFilter = store.getState().sampleFilter;

    store.getState().actions.applyDefinition({
      type: "LLM_AS_JUDGE",
      promptMessages: [{ role: "user", content: "Judge {{output}}" }],
      provider: "openai",
      model: "gpt-4.1-mini",
      modelParams: { temperature: 0.2 },
      vars: ["output"],
      variableMapping: [
        {
          templateVariable: "output",
          selectedColumnId: "output",
          jsonSelector: null,
        },
      ],
      outputDefinition: {
        dataType: "NUMERIC",
        score: {
          description: "Answer quality",
          minValue: 0,
          maxValue: 1,
        },
        reasoning: { description: "Explain the score" },
      },
    });

    expect(store.getState()).toMatchObject({
      type: "LLM_AS_JUDGE",
      name: "Answer quality",
      description: "Checks answer quality",
      promptMessages: [{ role: "user", content: "Judge {{output}}" }],
      modelMode: "custom",
      selectedModel: { provider: "openai", model: "gpt-4.1-mini" },
      modelParams: { temperature: 0.2 },
      variableFields: {
        output: { selectedColumnId: "output", jsonSelector: null },
      },
    });
    expect(store.getState().sampleFilter).toBe(sampleFilter);
  });

  it("loads an old code definition", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });

    store.getState().actions.applyDefinition({
      type: "CODE",
      sourceCode: "def evaluate(ctx):\n  return []",
      sourceCodeLanguage: "PYTHON",
    });

    expect(store.getState()).toMatchObject({
      type: "CODE",
      sourceCode: "def evaluate(ctx):\n  return []",
      sourceCodeLanguage: "PYTHON",
      sourceCodeDrafts: {
        PYTHON: "def evaluate(ctx):\n  return []",
      },
    });
  });
});
