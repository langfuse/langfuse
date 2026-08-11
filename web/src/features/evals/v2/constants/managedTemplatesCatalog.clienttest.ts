import {
  observationVariableMappingList,
  PersistedEvalOutputDefinitionSchema,
} from "@langfuse/shared";

import { managedTemplateToEvaluatorSetupDraft } from "@/src/features/evals/v2/fns/templateGallery/managedTemplateToEvaluatorSetupDraft";
import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";

describe("managed evaluator templates catalog", () => {
  it("contains valid, uniquely addressable templates", () => {
    const categoryKeys = new Set(
      MANAGED_TEMPLATES_CATALOG.categories.map(({ key }) => key),
    );
    const templateKeys = MANAGED_TEMPLATES_CATALOG.templates.map(
      ({ key }) => key,
    );

    expect(MANAGED_TEMPLATES_CATALOG.templates).toHaveLength(23);
    expect(new Set(templateKeys).size).toBe(templateKeys.length);

    for (const template of MANAGED_TEMPLATES_CATALOG.templates) {
      expect(categoryKeys.has(template.category)).toBe(true);
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
});
