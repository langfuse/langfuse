import {
  observationVariableMappingList,
  PersistedEvalOutputDefinitionSchema,
} from "@langfuse/shared";

import { managedTemplateToEvaluatorSetupDraft } from "@/src/features/evals/v2/fns/templateGallery/managedTemplateToEvaluatorSetupDraft";
import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import { validateCodeEvalSourceWithLanguage } from "@/src/features/evals/utils/code-eval-template-validation";

describe("managed evaluator templates catalog", () => {
  it("contains valid, uniquely addressable templates", () => {
    const categoryKeys = new Set(
      MANAGED_TEMPLATES_CATALOG.categories.map(({ key }) => key),
    );
    const templateKeys = MANAGED_TEMPLATES_CATALOG.templates.map(
      ({ key }) => key,
    );

    expect(MANAGED_TEMPLATES_CATALOG.templates).toHaveLength(20);
    expect(new Set(templateKeys).size).toBe(templateKeys.length);

    for (const template of MANAGED_TEMPLATES_CATALOG.templates) {
      expect(template.categories.length).toBeGreaterThan(0);
      expect(
        template.categories.every((category) => categoryKeys.has(category)),
      ).toBe(true);
      const draft = managedTemplateToEvaluatorSetupDraft(template);

      if (draft.definition.type === "LLM_AS_JUDGE") {
        expect(
          PersistedEvalOutputDefinitionSchema.safeParse(
            draft.definition.outputDefinition,
          ).success,
        ).toBe(true);
        expect(
          observationVariableMappingList.safeParse(
            draft.definition.variableMapping,
          ).success,
        ).toBe(true);
        expect(draft.definition.vars).toEqual(
          template.evaluator.type === "LLM_AS_JUDGE"
            ? template.evaluator.variables.map(({ name }) => name)
            : [],
        );
      }
    }
  });

  it("detects all-caps text in the latest user chat message", () => {
    const template = MANAGED_TEMPLATES_CATALOG.templates.find(
      ({ key }) => key === "all-caps",
    );

    expect(template?.evaluator.type).toBe("CODE");
    if (!template || template.evaluator.type !== "CODE") {
      throw new Error("All-caps code evaluator template not found");
    }

    const javascript = template.evaluator.source
      .replace(
        "function evaluate(ctx: EvaluationContext): EvaluationResult",
        "function evaluate(ctx)",
      )
      .replace("(value: unknown): string =>", "(value) =>")
      .replaceAll(" as Record<string, unknown>", "");
    const createEvaluator = new Function(
      `${javascript}\nreturn evaluate;`,
    ) as () => (ctx: { observation: { input: unknown } }) => {
      scores: Array<{
        value: boolean;
        comment?: string;
        metadata?: { ratioThreshold?: number };
      }>;
    };

    const evaluate = createEvaluator();
    const messages = [
      { role: "system", content: "Answer helpfully." },
      { role: "assistant", content: "How can I help?" },
      {
        role: "user",
        content: [{ type: "text", text: "THIS IS COMPLETELY BROKEN" }],
      },
    ];

    for (const input of [messages, { messages }]) {
      const result = evaluate({ observation: { input } });
      expect(result.scores[0]?.value).toBe(true);
      expect(result.scores[0]?.comment).toMatch(/uppercase/);
      expect(result.scores[0]?.metadata?.ratioThreshold).toBe(0.7);
    }

    // 70% threshold allows one lowercase word among mostly uppercase letters
    // ("THIS IS COMPLETELY broken" → 16/22 ≈ 72.7%, which fails the old 80% cut).
    const mixedCase = evaluate({
      observation: {
        input: [{ role: "user", content: "THIS IS COMPLETELY broken" }],
      },
    });
    expect(mixedCase.scores[0]?.value).toBe(true);

    // Short shoutouts stay false (4-letter floor).
    const tooShort = evaluate({
      observation: { input: [{ role: "user", content: "WTF" }] },
    });
    expect(tooShort.scores[0]?.value).toBe(false);
    expect(tooShort.scores[0]?.comment).toMatch(/too short/);
  });

  it("exact-match grades only expected_result and ignores sibling keys", () => {
    const template = MANAGED_TEMPLATES_CATALOG.templates.find(
      ({ key }) => key === "exact-match",
    );

    expect(template?.evaluator.type).toBe("CODE");
    if (!template || template.evaluator.type !== "CODE") {
      throw new Error("Exact-match code evaluator template not found");
    }

    const javascript = template.evaluator.source
      .replace(
        "function evaluate(ctx: EvaluationContext): EvaluationResult",
        "function evaluate(ctx)",
      )
      .replace("(value: unknown): value is Record<string, unknown>", "(value)")
      .replaceAll("(value: unknown): unknown", "(value)")
      .replaceAll("(value: unknown)", "(value)")
      .replaceAll(" as Record<string, unknown>", "");
    const createEvaluator = new Function(
      `${javascript}\nreturn evaluate;`,
    ) as () => (ctx: {
      observation: { output: unknown };
      experiment?: { itemExpectedOutput?: unknown };
    }) => {
      scores: Array<{
        value: boolean;
        comment?: string;
        metadata?: {
          expectedUnwrapped?: boolean;
          outputUnwrapped?: boolean;
        };
      }>;
    };

    const evaluate = createEvaluator();

    const match = evaluate({
      observation: { output: "defer_question" },
      experiment: {
        itemExpectedOutput: {
          expected_result: "defer_question",
          sample_reply: "I cannot give financial advice...",
          keyword_overlap: ["financial advice", "stock picks"],
        },
      },
    });
    expect(match.scores[0]?.value).toBe(true);
    expect(match.scores[0]?.comment).toMatch(/compared expected_result only/);
    expect(match.scores[0]?.metadata?.expectedUnwrapped).toBe(true);
    expect(match.scores[0]?.metadata?.outputUnwrapped).toBe(false);

    const wrappedOutputMatch = evaluate({
      observation: {
        output: {
          expected_result: "defer_question",
          extra: "ignored",
        },
      },
      experiment: {
        itemExpectedOutput: {
          expected_result: "defer_question",
          sample_reply: "ignored",
        },
      },
    });
    expect(wrappedOutputMatch.scores[0]?.value).toBe(true);
    expect(wrappedOutputMatch.scores[0]?.metadata?.outputUnwrapped).toBe(true);

    const mismatch = evaluate({
      observation: { output: "answer_directly" },
      experiment: {
        itemExpectedOutput: {
          expected_result: "defer_question",
          sample_reply: "ignored",
        },
      },
    });
    expect(mismatch.scores[0]?.value).toBe(false);
    expect(mismatch.scores[0]?.comment).toMatch(/mismatch/);

    // Without expected_result, compare the whole expected output (key order ignored).
    const wholeObjectMatch = evaluate({
      observation: { output: { b: 2, a: 1 } },
      experiment: { itemExpectedOutput: { a: 1, b: 2 } },
    });
    expect(wholeObjectMatch.scores[0]?.value).toBe(true);
    expect(wholeObjectMatch.scores[0]?.comment).toMatch(
      /no expected_result key/,
    );
  });

  it("keyword-overlap scores the fraction of keyword_overlap hits", () => {
    const template = MANAGED_TEMPLATES_CATALOG.templates.find(
      ({ key }) => key === "keyword-match",
    );

    expect(template?.evaluator.type).toBe("CODE");
    if (!template || template.evaluator.type !== "CODE") {
      throw new Error("Keyword-overlap code evaluator template not found");
    }

    const javascript = template.evaluator.source
      .replace(
        "function evaluate(ctx: EvaluationContext): EvaluationResult",
        "function evaluate(ctx)",
      )
      .replace("(value: unknown): value is Record<string, unknown>", "(value)")
      .replaceAll("(value: unknown): string", "(value)")
      .replaceAll("(value: unknown)", "(value)")
      .replace(
        '(keyword): keyword is string => typeof keyword === "string"',
        '(keyword) => typeof keyword === "string"',
      )
      .replaceAll(" as Record<string, unknown>", "");
    const createEvaluator = new Function(
      `${javascript}\nreturn evaluate;`,
    ) as () => (ctx: {
      observation: { output: unknown };
      experiment?: { itemExpectedOutput?: unknown };
    }) => {
      scores: Array<{
        name?: string;
        value: number;
        dataType?: string;
        comment?: string;
        metadata?: { missing?: string[]; foundCount?: number };
      }>;
    };

    const evaluate = createEvaluator();

    const partial = evaluate({
      observation: {
        output: "I cannot give financial advice or stock picks.",
      },
      experiment: {
        itemExpectedOutput: {
          keyword_overlap: ["financial advice", "stock picks", "Langfuse"],
          expected_result: "defer_question",
        },
      },
    });
    expect(partial.scores).toHaveLength(1);
    expect(partial.scores[0]?.name).toBe("Keyword overlap");
    expect(partial.scores[0]?.dataType).toBe("NUMERIC");
    expect(partial.scores[0]?.value).toBeCloseTo(2 / 3);
    expect(partial.scores[0]?.comment).toMatch(/missing: Langfuse/);
    expect(partial.scores[0]?.metadata?.foundCount).toBe(2);
    expect(partial.scores[0]?.metadata?.missing).toEqual(["Langfuse"]);

    const allFound = evaluate({
      observation: {
        output: "Langfuse helps with financial advice and stock picks.",
      },
      experiment: {
        itemExpectedOutput: ["financial advice", "stock picks", "Langfuse"],
      },
    });
    expect(allFound.scores[0]?.value).toBe(1);
    expect(allFound.scores[0]?.comment).toMatch(/all 3 keywords found/);

    // No keywords → emit no score so the item does not drag averages down.
    const noKeywords = evaluate({
      observation: { output: "anything" },
      experiment: {
        itemExpectedOutput: { expected_result: "defer_question" },
      },
    });
    expect(noKeywords.scores).toEqual([]);
  });

  it("ships code evaluator templates that pass client validation", async () => {
    for (const template of MANAGED_TEMPLATES_CATALOG.templates) {
      if (template.evaluator.type !== "CODE") continue;

      const result = await validateCodeEvalSourceWithLanguage({
        source: template.evaluator.source,
        sourceCodeLanguage: template.evaluator.language,
      });

      expect(
        result.diagnostics.filter(({ severity }) => severity === "error"),
        template.key,
      ).toEqual([]);
    }
  });
});
