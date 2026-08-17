import type { LucideIcon } from "lucide-react";
import type {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  PersistedEvalOutputDefinition,
} from "@langfuse/shared";

import type { EvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

export type EvaluatorSetupDraft = {
  name: string;
  description: string | null;
  definition: EvaluatorDefinition;
};

export type TemplateRunTarget = "experiment" | "live-observations";

export type ManagedTemplate = {
  key: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  maintainer: string;
  runsOn: TemplateRunTarget[];
  evaluator:
    | {
        type: Extract<EvalTemplateType, "LLM_AS_JUDGE">;
        prompt: string;
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
