import {
  Code2,
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
  "code-2": Code2,
  sparkles: Sparkles,
};

const CONVERSATION_TEMPLATE_ORDER = [
  "chat-intent",
  "user-disagreement",
  "all-caps",
  "user-distress",
  "out-of-scope-request",
  "language",
] as const;

const CONVERSATION_TEMPLATE_RANK = new Map<string, number>(
  CONVERSATION_TEMPLATE_ORDER.map((key, index) => [key, index]),
);

const RECOMMENDED_TEMPLATE_ORDER = [
  "chat-intent",
  "out-of-scope-request",
  "language",
  "answer-relevance",
  "quality-criterion",
  "rule-adherence",
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
    matches(template.name, template.prompt),
  );
  const managedCatalog = managedEvaluatorTemplateService.list({ search });
  const managedByCategory = new Map(
    managedCatalog.categories.map((category) => [
      category.key,
      (category.key === "conversation"
        ? managedCatalog.templates
            .filter((template) => template.categories.includes(category.key))
            .toSorted(
              (left, right) =>
                (CONVERSATION_TEMPLATE_RANK.get(left.key) ??
                  Number.MAX_SAFE_INTEGER) -
                (CONVERSATION_TEMPLATE_RANK.get(right.key) ??
                  Number.MAX_SAFE_INTEGER),
            )
        : category.key === "recommended"
          ? managedCatalog.templates
              .filter((template) => template.categories.includes(category.key))
              .toSorted(
                (left, right) =>
                  (RECOMMENDED_TEMPLATE_RANK.get(left.key) ??
                    Number.MAX_SAFE_INTEGER) -
                  (RECOMMENDED_TEMPLATE_RANK.get(right.key) ??
                    Number.MAX_SAFE_INTEGER),
              )
          : managedCatalog.templates.filter((template) =>
              template.categories.includes(category.key),
            )
      ).map((template) => ({ source: "managed" as const, ...template })),
    ]),
  );
  const navigationItems: GalleryNavigationItem[] = [
    ...(customTemplates.length
      ? [
          {
            key: EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
            label: "Your Templates",
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
            label: "Your Templates",
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
