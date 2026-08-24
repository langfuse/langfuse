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
      scores: Array<{ value: boolean }>;
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
    }
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
