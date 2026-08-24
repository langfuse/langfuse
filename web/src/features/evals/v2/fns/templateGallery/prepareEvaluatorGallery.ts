import type {
  CustomEvaluatorTemplate,
  GalleryNavigationItem,
  GallerySection,
} from "@/src/features/evals/v2/types/templateGallery";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";
import { EVALUATOR_GALLERY_PROJECT_SECTION_KEY } from "@/src/features/evals/v2/constants/evaluatorGallery";

const RECOMMENDED_TEMPLATE_ORDER = [
  "topic-classifier",
  "out-of-scope-request",
  "quality-criterion",
] as const;

const RECOMMENDED_TEMPLATE_RANK = new Map<string, number>(
  RECOMMENDED_TEMPLATE_ORDER.map((key, index) => [key, index]),
);

export function prepareEvaluatorGallery({
  customTemplates,
  customTemplateCount,
  search,
}: {
  customTemplates: CustomEvaluatorTemplate[];
  customTemplateCount: number;
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
      const orderedTemplates =
        category.key === "recommended"
          ? templatesInCategory.toSorted(
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
    {
      key: EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
      label: "Your templates",
      icon: getGalleryCategoryPresentation(
        EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
      ).icon,
      count: customTemplateCount,
    },
    ...managedCatalog.categories.map((category) => ({
      key: category.key,
      label: category.label,
      icon: getGalleryCategoryPresentation(category.key).icon,
      count: managedByCategory.get(category.key)?.length ?? 0,
    })),
  ];
  const sections: GallerySection[] = [
    ...(filteredCustom.length
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
  ];

  return { navigationItems, sections };
}
