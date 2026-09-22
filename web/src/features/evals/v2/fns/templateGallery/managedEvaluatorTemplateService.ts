import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";

export const managedEvaluatorTemplateService = {
  list({
    search,
    category,
    type,
    includeDecisionModels = false,
  }: {
    search?: string;
    category?: string;
    type?: "LLM_AS_JUDGE" | "CODE";
    includeDecisionModels?: boolean;
  } = {}) {
    const query = search?.trim().toLowerCase();

    return {
      schemaVersion: MANAGED_TEMPLATES_CATALOG.schemaVersion,
      categories: MANAGED_TEMPLATES_CATALOG.categories,
      templates: MANAGED_TEMPLATES_CATALOG.templates.filter(
        (template) =>
          (includeDecisionModels ||
            template.evaluator.type !== "DECISION_MODEL") &&
          (!query ||
            template.name.toLowerCase().includes(query) ||
            template.description.toLowerCase().includes(query)) &&
          (!category || template.categories.includes(category)) &&
          (!type || template.evaluator.type === type),
      ),
    };
  },

  get(key: string) {
    return MANAGED_TEMPLATES_CATALOG.templates.find(
      (template) => template.key === key,
    );
  },
};
