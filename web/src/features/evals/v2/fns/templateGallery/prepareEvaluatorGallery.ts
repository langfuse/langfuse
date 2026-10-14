import type {
  CustomEvaluatorTemplate,
  GalleryNavigationItem,
  GallerySection,
} from "@/src/features/evals/v2/types/templateGallery";
import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";
import { EVALUATOR_GALLERY_PROJECT_SECTION_KEY } from "@/src/features/evals/v2/constants/evaluatorGallery";

const RECOMMENDED_TEMPLATE_ORDER = [
  "topic-decision-model",
  "topic-classifier",
  "out-of-scope-request",
  "quality-criterion",
] as const;

const RECOMMENDED_TEMPLATE_REPLACEMENTS: Record<string, string> = {
  "topic-decision-model": "topic-classifier",
};

const RECOMMENDED_TEMPLATE_RANK = new Map<string, number>(
  RECOMMENDED_TEMPLATE_ORDER.map((key, index) => [key, index]),
);

export function prepareEvaluatorGallery({
  customTemplates,
  customTemplateCount,
  hasCustomTemplates = customTemplateCount > 0,
  search,
}: {
  customTemplates: CustomEvaluatorTemplate[];
  /** Saved evaluators matching the current search. */
  customTemplateCount: number;
  /** Whether the project has any saved evaluators, ignoring the search. */
  hasCustomTemplates?: boolean;
  search: string;
}): {
  navigationItems: GalleryNavigationItem[];
  sections: GallerySection[];
} {
  const query = search.trim().toLowerCase();
  const matches = (name: string, description: string | null | undefined) =>
    !query ||
    name.toLowerCase().includes(query) ||
    description?.toLowerCase().includes(query);
  const filteredCustom = customTemplates.filter((template) =>
    matches(template.name, template.description),
  );
  const managedCatalog = managedEvaluatorTemplateService.list({ search });
  const managedByCategory = new Map(
    managedCatalog.categories.map((category) => {
      const templatesInCategory = managedCatalog.templates.filter((template) =>
        template.categories.includes(category.key),
      );
      const replacedKeys = new Set(
        templatesInCategory.flatMap(
          (template) => RECOMMENDED_TEMPLATE_REPLACEMENTS[template.key] ?? [],
        ),
      );
      const orderedTemplates =
        category.key === "recommended"
          ? templatesInCategory
              .filter((template) => !replacedKeys.has(template.key))
              .toSorted(
                (left, right) =>
                  (RECOMMENDED_TEMPLATE_RANK.get(left.key) ??
                    Number.MAX_SAFE_INTEGER) -
                  (RECOMMENDED_TEMPLATE_RANK.get(right.key) ??
                    Number.MAX_SAFE_INTEGER),
              )
          : templatesInCategory;

      return [
        category.key,
        orderedTemplates.map((template) => ({
          source: "managed" as const,
          ...template,
        })),
      ];
    }),
  );
  const navigationItems: GalleryNavigationItem[] = [
    ...managedCatalog.categories.map((category) => ({
      key: category.key,
      label: category.label,
      count: managedByCategory.get(category.key)?.length ?? 0,
    })),
    // Projects without saved evaluators get no empty "Your templates" entry.
    ...(hasCustomTemplates
      ? [
          {
            key: EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
            label: "Your templates",
            count: customTemplateCount,
          },
        ]
      : []),
  ];

  // Own templates last: catalog sections lead the browse view.
  const sections: GallerySection[] = [
    ...managedCatalog.categories.flatMap((category) => {
      const templates = managedByCategory.get(category.key) ?? [];
      return templates.length
        ? [
            {
              key: category.key,
              label: category.label,
              description: category.description,
              templates,
            },
          ]
        : [];
    }),
    // Kept while the sidebar lists it, so selecting it lands even at 0 matches.
    ...(hasCustomTemplates
      ? [
          {
            key: EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
            label: "Your templates",
            description: "Start from a template this project already created.",
            totalCount: customTemplateCount,
            templates: filteredCustom.map((template) => ({
              source: "custom" as const,
              ...template,
            })),
          },
        ]
      : []),
  ];

  return { navigationItems, sections };
}
