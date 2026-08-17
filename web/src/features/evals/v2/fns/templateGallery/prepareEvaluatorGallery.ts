import {
  FileSearch,
  Gauge,
  ListFilter,
  MessagesSquare,
  Shield,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";

import type {
  CustomEvaluatorTemplate,
  GalleryNavigationItem,
  GallerySection,
} from "@/src/features/evals/v2/types/templateGallery";
import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";
import { EVALUATOR_GALLERY_PROJECT_SECTION_KEY } from "@/src/features/evals/v2/constants/evaluatorGallery";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  shield: Shield,
  "file-search": FileSearch,
  "list-filter": ListFilter,
  "messages-square": MessagesSquare,
  sparkles: Sparkles,
};

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
    matches(template.name, template.prompt),
  );
  const managedCatalog = managedEvaluatorTemplateService.list({ search });
  const managedByCategory = new Map(
    managedCatalog.categories.map((category) => [
      category.key,
      managedCatalog.templates
        .filter((template) => template.category === category.key)
        .map((template) => ({ source: "managed" as const, ...template })),
    ]),
  );
  const navigationItems: GalleryNavigationItem[] = [
    ...(customTemplates.length
      ? [
          {
            key: EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
            label: "Your Examples",
            icon: User,
            count: customTemplateCount,
          },
        ]
      : []),
    ...managedCatalog.categories
      .map((category) => ({
        key: category.key,
        label: category.label,
        icon: CATEGORY_ICONS[category.icon],
        count: managedEvaluatorTemplateService.list({
          category: category.key,
        }).templates.length,
      }))
      .filter(({ count }) => count > 0),
  ];
  const sections: GallerySection[] = [
    ...(filteredCustom.length
      ? [
          {
            key: EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
            label: "Your Examples",
            description:
              "Start from an evaluator this project already created.",
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
