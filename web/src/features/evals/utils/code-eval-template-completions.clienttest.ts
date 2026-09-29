import { EditorState, Transaction } from "@codemirror/state";
import { acceptCompletion, CompletionContext } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { basicSetup, EditorView } from "@uiw/react-codemirror";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  getCodeEvalCompletionExtension,
  getCodeEvalCompletionSource,
} from "@/src/features/evals/utils/code-eval-template-completions";
import {
  CODE_EVAL_COMPLETION_CONTRACT,
  type CodeEvalSourceCodeLanguage,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";

const originalGetClientRects = Range.prototype.getClientRects;

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

afterAll(() => {
  Range.prototype.getClientRects = originalGetClientRects;
});

const TOOL_CALL_LABELS = ["id", "name", "arguments", "type", "index"];

function languageExtensionFor(sourceCodeLanguage: CodeEvalSourceCodeLanguage) {
  return sourceCodeLanguage === "PYTHON"
    ? python()
    : javascript({ typescript: true });
}

function getCompletions(
  doc: string,
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
) {
  const result = runCompletionSource(doc, sourceCodeLanguage);

  return {
    from: result?.from,
    labels: result?.options.map((option) => option.label),
    acceptsEmptyPrefix:
      result?.validFor instanceof RegExp ? result.validFor.test("") : false,
  };
}

function runCompletionSource(
  doc: string,
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
  position = doc.length,
) {
  const state = EditorState.create({
    doc,
    extensions: [languageExtensionFor(sourceCodeLanguage)],
  });
  const source = getCodeEvalCompletionSource(sourceCodeLanguage);
  const result = source(new CompletionContext(state, position, false));
  if (result instanceof Promise) {
    throw new Error("code eval completion source must resolve synchronously");
  }
  return result;
}

function mountEditor(
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
  options: { doc?: string; anchor?: number } = {},
) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      selection:
        options.anchor !== undefined ? { anchor: options.anchor } : undefined,
      extensions: [
        basicSetup({ autocompletion: false, completionKeymap: false }),
        languageExtensionFor(sourceCodeLanguage),
        getCodeEvalCompletionExtension(sourceCodeLanguage),
      ],
    }),
  });

  return {
    view,
    typeText: (from: number, insert: string, anchor: number) =>
      view.dispatch({
        changes: { from, insert },
        selection: { anchor },
        annotations: Transaction.userEvent.of("input.type"),
      }),
    completionLabels: () =>
      Array.from(
        parent.querySelectorAll<HTMLElement>(".cm-completionLabel"),
      ).map((element) => element.textContent),
    cleanup: () => {
      view.destroy();
      parent.remove();
    },
  };
}

describe("code evaluator context completions", () => {
  it.each(["TYPESCRIPT", "PYTHON"] as const)(
    "opens automatically while typing in %s",
    async (sourceCodeLanguage) => {
      const editor = mountEditor(sourceCodeLanguage);

      try {
        editor.typeText(0, "ctx.", 4);

        await vi.waitFor(() => {
          expect(editor.completionLabels()).toEqual(
            expect.arrayContaining(["observation", "experiment"]),
          );
          expect(editor.completionLabels()).toHaveLength(2);
        });
      } finally {
        editor.cleanup();
      }
    },
  );

  it("chains TypeScript dataType property and enum completions", async () => {
    const editor = mountEditor("TYPESCRIPT");

    try {
      const source =
        "function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [{ dataT";
      editor.typeText(0, source, source.length);

      await vi.waitFor(() => {
        expect(editor.completionLabels()).toEqual(["dataType"]);
      });
      // @codemirror/autocomplete guards acceptCompletion behind a ~75ms
      // interaction delay after the popup opens.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(acceptCompletion(editor.view)).toBe(true);

      await vi.waitFor(() => {
        expect(editor.completionLabels()).toEqual(
          expect.arrayContaining([
            '"NUMERIC"',
            '"BOOLEAN"',
            '"CATEGORICAL"',
            '"TEXT"',
          ]),
        );
        expect(editor.completionLabels()).toHaveLength(4);
      });
    } finally {
      editor.cleanup();
    }
  });

  it("completes the documented TypeScript context tree", () => {
    expect(getCompletions("ctx.", "TYPESCRIPT")).toEqual({
      from: 4,
      labels: ["observation", "experiment"],
      acceptsEmptyPrefix: true,
    });
    expect(getCompletions("ctx.observation.", "TYPESCRIPT")).toEqual({
      from: 16,
      labels: ["input", "output", "metadata", "toolCalls"],
      acceptsEmptyPrefix: true,
    });
    expect(getCompletions("ctx.experiment?.", "TYPESCRIPT")).toEqual({
      from: 16,
      labels: ["itemExpectedOutput", "itemMetadata"],
      acceptsEmptyPrefix: true,
    });
  });

  it("completes the documented Python context tree", () => {
    expect(getCompletions("ctx.", "PYTHON")).toEqual({
      from: 4,
      labels: ["observation", "experiment"],
      acceptsEmptyPrefix: true,
    });
    expect(getCompletions("ctx.observation.", "PYTHON")).toEqual({
      from: 16,
      labels: ["input", "output", "metadata", "tool_calls"],
      acceptsEmptyPrefix: true,
    });
    expect(getCompletions("ctx.experiment.", "PYTHON")).toEqual({
      from: 15,
      labels: ["item_expected_output", "item_metadata"],
      acceptsEmptyPrefix: true,
    });
  });

  it("completes fields on indexed tool calls", () => {
    expect(
      getCompletions("ctx.observation.toolCalls[callIndex]?.", "TYPESCRIPT"),
    ).toEqual({
      from: 38,
      labels: TOOL_CALL_LABELS,
      acceptsEmptyPrefix: true,
    });
    expect(
      getCompletions("ctx.observation.toolCalls?.[0].", "TYPESCRIPT"),
    ).toEqual({
      from: 31,
      labels: TOOL_CALL_LABELS,
      acceptsEmptyPrefix: true,
    });
    expect(
      getCompletions("ctx.observation.tool_calls[-1].na", "PYTHON"),
    ).toEqual({
      from: 31,
      labels: TOOL_CALL_LABELS,
      acceptsEmptyPrefix: true,
    });
  });

  it("completes while editing inside an identifier", () => {
    const midWord = runCompletionSource("ctx.observation", "TYPESCRIPT", 8);
    expect(midWord?.from).toBe(4);
    expect(midWord?.options.map((option) => option.label)).toEqual([
      "observation",
      "experiment",
    ]);

    // The keyword argument being edited keeps its own name available.
    const editedKeyword = runCompletionSource(
      "return Score(name=1)",
      "PYTHON",
      "return Score(na".length,
    );
    expect(editedKeyword?.from).toBe("return Score(".length);
    expect(editedKeyword?.options.map((option) => option.label)).toContain(
      "name",
    );
  });

  it("follows direct and chained context aliases", () => {
    expect(
      getCompletions(
        "function evaluate(ctx) {\n  const observation = ctx.observation;\n  const alias = observation;\n  alias.to",
        "TYPESCRIPT",
      ),
    ).toEqual({
      from: 101,
      labels: ["input", "output", "metadata", "toolCalls"],
      acceptsEmptyPrefix: true,
    });
    expect(
      getCompletions(
        "def evaluate(ctx):\n  observation = ctx.observation\n  alias = observation\n  alias.to",
        "PYTHON",
      ),
    ).toEqual({
      from: 81,
      labels: ["input", "output", "metadata", "tool_calls"],
      acceptsEmptyPrefix: true,
    });
  });

  it("stops completing aliases after reassignment", () => {
    expect(
      getCompletions(
        "def evaluate(ctx):\n  observation = ctx.observation\n  observation = {}\n  observation.",
        "PYTHON",
      ).labels,
    ).toBeUndefined();
    expect(
      getCompletions(
        "def evaluate(ctx):\n  observation = ctx.observation\n  if ctx.observation.input:\n    observation = {}\n  observation.",
        "PYTHON",
      ).labels,
    ).toBeUndefined();
  });

  it("completes inside string interpolations", () => {
    const templateString = "`${ctx.observation.}`";
    expect(
      runCompletionSource(
        templateString,
        "TYPESCRIPT",
        templateString.indexOf(".}") + 1,
      )?.options.map((option) => option.label),
    ).toEqual(["input", "output", "metadata", "toolCalls"]);

    const formatString = 'f"{ctx.observation.}"';
    expect(
      runCompletionSource(
        formatString,
        "PYTHON",
        formatString.indexOf(".}") + 1,
      )?.options.map((option) => option.label),
    ).toEqual(["input", "output", "metadata", "tool_calls"]);
  });

  it("invalidates aliases shadowed by loop, catch, and with bindings", () => {
    expect(
      getCompletions(
        "def evaluate(ctx):\n  observation = ctx.observation\n  for observation in items:\n    observation.",
        "PYTHON",
      ).labels,
    ).toBeUndefined();
    expect(
      getCompletions(
        "function evaluate(ctx) {\n  const observation = ctx.observation;\n  for (const observation of items) {\n    observation.",
        "TYPESCRIPT",
      ).labels,
    ).toBeUndefined();
    // The iterated expression is a read, not a binding.
    expect(
      getCompletions(
        "def evaluate(ctx):\n  observation = ctx.observation\n  for item in observation.tool_calls:\n    pass\n  observation.",
        "PYTHON",
      ).labels,
    ).toEqual(["input", "output", "metadata", "tool_calls"]);
  });

  it("invalidates aliases behind tuple, destructuring, and multi-declarator targets", () => {
    expect(
      getCompletions(
        "def evaluate(ctx):\n  b = ctx.observation\n  a, b = 1, 2\n  b.",
        "PYTHON",
      ).labels,
    ).toBeUndefined();
    expect(
      getCompletions(
        "function evaluate(ctx) {\n  let x = ctx.observation;\n  [x] = [{}];\n  x.",
        "TYPESCRIPT",
      ).labels,
    ).toBeUndefined();
    expect(
      getCompletions(
        "function evaluate(ctx) {\n  var x = ctx.observation;\n  var a = 1, x = {};\n  x.",
        "TYPESCRIPT",
      ).labels,
    ).toBeUndefined();
  });

  it("keeps aliases that are only written through member targets", () => {
    expect(
      getCompletions(
        "def evaluate(ctx):\n  observation = ctx.observation\n  cache[0] = observation\n  observation.",
        "PYTHON",
      ).labels,
    ).toEqual(["input", "output", "metadata", "tool_calls"]);
    expect(
      getCompletions(
        "function evaluate(ctx) {\n  const observation = ctx.observation;\n  cache[0] = observation;\n  observation.",
        "TYPESCRIPT",
      ).labels,
    ).toEqual(["input", "output", "metadata", "toolCalls"]);
  });

  it("completes Python result constructors and unused keyword parameters", () => {
    const pythonContract = CODE_EVAL_COMPLETION_CONTRACT.PYTHON;

    expect(getCompletions("return Eval", "PYTHON").labels).toEqual([
      "EvaluationResult",
      "Score",
    ]);

    const evaluationResult = runCompletionSource(
      "return EvaluationResult(sc",
      "PYTHON",
    );
    expect(evaluationResult?.options).toEqual(
      pythonContract.constructorParameters.EvaluationResult.map(
        (parameter) => ({
          ...parameter,
          type: "property",
          apply: `${parameter.label}=`,
        }),
      ),
    );

    const score = runCompletionSource(
      'return Score(name="quality", va',
      "PYTHON",
    );
    expect(score?.options).toEqual(
      pythonContract.constructorParameters.Score.filter(
        (parameter) => parameter.label !== "name",
      ).map((parameter) => ({
        ...parameter,
        type: "property",
        apply: `${parameter.label}=`,
      })),
    );
  });

  it("completes the TypeScript return type and returned object fields", () => {
    const typescriptContract = CODE_EVAL_COMPLETION_CONTRACT.TYPESCRIPT;

    const returnType = runCompletionSource(
      "function evaluate(ctx: EvaluationContext): Eval",
      "TYPESCRIPT",
    );
    expect(returnType?.options).toEqual([
      { ...typescriptContract.resultType, type: "type" },
    ]);
    expect(
      runCompletionSource(
        "async function evaluate(ctx: EvaluationContext): Promise<Eval",
        "TYPESCRIPT",
      )?.options,
    ).toEqual([{ ...typescriptContract.resultType, type: "type" }]);

    const result = runCompletionSource(
      "function evaluate(ctx: EvaluationContext): EvaluationResult { return { sc",
      "TYPESCRIPT",
    );
    expect(result?.options).toEqual(
      typescriptContract.resultProperties.map((property) => ({
        ...property,
        type: "property",
        apply: `${property.label}: `,
      })),
    );

    const score = runCompletionSource(
      'function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [{ name: "quality", va',
      "TYPESCRIPT",
    );
    expect(score?.options).toEqual(
      typescriptContract.scoreProperties
        .filter((property) => property.label !== "name")
        .map((property) => ({
          ...property,
          type: "property",
          apply: `${property.label}: `,
        })),
    );
  });

  it("keeps offering entry completions after whitespace behind `{`, `(`, or `,`", () => {
    const scoreObjectPrefix =
      'function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [{ comment: "quality",';

    for (const doc of [`${scoreObjectPrefix} `, `${scoreObjectPrefix}\n  `]) {
      expect(
        runCompletionSource(doc, "TYPESCRIPT")?.options.map(
          (option) => option.label,
        ),
      ).toEqual(["name", "value", "dataType", "configId", "metadata"]);
    }
    expect(
      runCompletionSource(
        "function evaluate(ctx: EvaluationContext): EvaluationResult { return { ",
        "TYPESCRIPT",
      )?.options.map((option) => option.label),
    ).toEqual(["scores"]);
    expect(
      runCompletionSource(
        'return Score(name="quality", ',
        "PYTHON",
      )?.options.map((option) => option.label),
    ).toEqual(["value", "data_type", "comment", "config_id", "metadata"]);

    // After a value without a separator, inserting a property would be
    // invalid syntax.
    expect(
      getCompletions(
        'function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [{ comment: "quality" ',
        "TYPESCRIPT",
      ).labels,
    ).toBeUndefined();
    expect(
      getCompletions('return Score(name="quality" ', "PYTHON").labels,
    ).toBeUndefined();
  });

  it("keeps the completion popup open when typing a space after a comma", async () => {
    const editor = mountEditor("TYPESCRIPT");

    try {
      const source =
        'function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [{ comment: "quality",';
      editor.typeText(0, source, source.length);

      await vi.waitFor(() => {
        expect(editor.completionLabels()).toContain("name");
      });

      editor.typeText(source.length, " ", source.length + 1);

      await vi.waitFor(() => {
        expect(editor.completionLabels()).toContain("name");
      });
    } finally {
      editor.cleanup();
    }
  });

  it("treats arrow-function evaluators like function declarations", () => {
    expect(
      runCompletionSource(
        "const evaluate = (ctx: EvaluationContext): Eval",
        "TYPESCRIPT",
      )?.options.map((option) => option.label),
    ).toEqual(["EvaluationResult"]);
    expect(
      runCompletionSource(
        "const evaluate = (ctx: EvaluationContext): EvaluationResult => { return { sc",
        "TYPESCRIPT",
      )?.options.map((option) => option.label),
    ).toEqual(["scores"]);
    // Expression bodies return without a ReturnStatement. Brackets are
    // balanced because closeBrackets auto-inserts them while typing.
    const expressionBody =
      "const evaluate = (ctx: EvaluationContext): EvaluationResult => ({ sc })";
    expect(
      runCompletionSource(
        expressionBody,
        "TYPESCRIPT",
        expressionBody.indexOf("sc ") + 2,
      )?.options.map((option) => option.label),
    ).toEqual(["scores"]);

    // Only the evaluator's declarator counts.
    const otherExpressionBody =
      "const other = (ctx: EvaluationContext): EvaluationResult => ({ sc })";
    expect(
      runCompletionSource(
        otherExpressionBody,
        "TYPESCRIPT",
        otherExpressionBody.indexOf("sc ") + 2,
      ),
    ).toBeNull();
  });

  it("completes TypeScript score data type values inside strings", () => {
    const scorePrefix =
      "function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [{ dataType: ";

    expect(getCompletions(scorePrefix, "TYPESCRIPT").labels).toEqual([
      '"NUMERIC"',
      '"BOOLEAN"',
      '"CATEGORICAL"',
      '"TEXT"',
    ]);
    expect(getCompletions(`${scorePrefix}"BO`, "TYPESCRIPT").labels).toEqual([
      '"NUMERIC"',
      '"BOOLEAN"',
      '"CATEGORICAL"',
      '"TEXT"',
    ]);
    expect(getCompletions(`${scorePrefix}'CA`, "TYPESCRIPT").labels).toEqual([
      "'NUMERIC'",
      "'BOOLEAN'",
      "'CATEGORICAL'",
      "'TEXT'",
    ]);

    const completeSource = `${scorePrefix}"" }] }; }`;
    expect(
      runCompletionSource(
        completeSource,
        "TYPESCRIPT",
        completeSource.indexOf('""') + 1,
      )?.options.map((option) => option.label),
    ).toEqual(['"NUMERIC"', '"BOOLEAN"', '"CATEGORICAL"', '"TEXT"']);

    // Accepting mid-value replaces the whole quoted value so no suffix of the
    // old value survives ("CA|TEGORY" must not become "NUMERICTEGORY").
    const midValueSource = `${scorePrefix}"CATEGORY" }] }; }`;
    const midValue = runCompletionSource(
      midValueSource,
      "TYPESCRIPT",
      midValueSource.indexOf('"CATEGORY') + 3,
    );
    expect(midValue?.to).toBe(
      midValueSource.indexOf('"CATEGORY') + '"CATEGORY'.length,
    );
  });

  it("completes Python score data type values before typing a value", () => {
    // Quote-variant handling is shared code covered by the TypeScript test.
    expect(
      getCompletions(
        'return Score(name="quality", value=True, data_type=',
        "PYTHON",
      ).labels,
    ).toEqual(['"NUMERIC"', '"BOOLEAN"', '"CATEGORICAL"', '"TEXT"']);
  });

  it("does not complete unrelated paths, strings, comments, or prototypes", () => {
    expect(getCompletions("other.observation.", "TYPESCRIPT").labels).toBe(
      undefined,
    );
    expect(
      getCompletions('"ctx.observation.toolCalls[0]."', "TYPESCRIPT").labels,
    ).toBeUndefined();
    expect(
      getCompletions("# ctx.observation.tool_calls[0].", "PYTHON").labels,
    ).toBeUndefined();
    expect(getCompletions("ctx.", "TYPESCRIPT").labels).not.toContain(
      "toString",
    );
    expect(
      getCompletions("const unrelated = { sc", "TYPESCRIPT").labels,
    ).toBeUndefined();
    expect(
      getCompletions(
        "function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [{ dataType: // BOOLEAN",
        "TYPESCRIPT",
      ).labels,
    ).toBeUndefined();
    expect(
      getCompletions(
        'return Score(name="quality", value=True, data_type= # BOOLEAN',
        "PYTHON",
      ).labels,
    ).toBeUndefined();
  });
});
