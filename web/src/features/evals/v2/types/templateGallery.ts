import type { LucideIcon } from "lucide-react";
import type {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  EvaluatorPromptMessage,
  PersistedEvalOutputDefinition,
} from "@langfuse/shared";

import type { NormalizedEvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

export type EvaluatorSetupDraft = {
  name: string;
  description: string | null;
  definition: NormalizedEvaluatorDefinition;
};

export type ManagedTemplate = {
  key: string;
  name: string;
  categories: string[];
  icon: string;
  description: string;
  maintainer: string;
  evaluator:
    | {
        type: Extract<EvalTemplateType, "LLM_AS_JUDGE">;
        promptMessages: EvaluatorPromptMessage[];
        variables: Array<{
          name: string;
          defaultMapping: { field: string };
        }>;
        outputDefinition: PersistedEvalOutputDefinition;
      }
    | {
        type: Extract<EvalTemplateType, "CODE">;
        language: EvalTemplateSourceCodeLanguage;
        source: string;
      };
};

/** One of the project's own saved evaluators. */
export type CustomEvaluatorTemplate = {
  id: string;
  name: string;
  description?: string | null;
  type: EvalTemplateType;
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
  totalCount?: number;
};
