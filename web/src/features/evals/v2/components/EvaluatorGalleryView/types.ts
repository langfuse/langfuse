import type { LucideIcon } from "lucide-react";
import type {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
} from "@langfuse/shared";

import type { ManagedTemplate } from "@/src/features/evals/v2/managedTemplatesCatalog";

/** One of the project's own saved evaluators. */
export type CustomEvaluatorTemplate = {
  id: string;
  name: string;
  type: EvalTemplateType;
  prompt: string | null;
  sourceCodeLanguage?: EvalTemplateSourceCodeLanguage | null;
  updatedAt: Date;
  version: number;
  createdByUser?: { name: string | null; email: string | null } | null;
};

/**
 * Gallery entries come from two places that share no storage: the managed
 * catalog that ships with Langfuse, and the project's saved evaluators. The
 * container passes each in already tagged, so nothing has to infer provenance
 * from the absence of database columns.
 */
export type GalleryTemplate =
  | ({ source: "managed" } & ManagedTemplate)
  | ({ source: "custom" } & CustomEvaluatorTemplate);

/** Stable list key — managed templates are identified by name, not by id. */
export function galleryTemplateKey(template: GalleryTemplate) {
  return template.source === "managed" ? template.name : template.id;
}

export type GalleryNavigationItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
};

export type GallerySection = {
  key: string;
  label: string;
  description: string;
  templates: GalleryTemplate[];
};
