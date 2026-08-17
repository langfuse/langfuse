import {
  BookOpenCheck,
  Building2,
  CircleCheck,
  Code2,
  Equal,
  FileSearch,
  Frown,
  Gauge,
  Languages,
  ListChecks,
  ListFilter,
  MessageSquare,
  MessagesSquare,
  Scale,
  ScanSearch,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Tags,
  Target,
  Type,
  User,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import type {
  CustomEvaluatorTemplate,
  ExpectedOutputHint,
  GalleryTemplate,
  ManagedTemplate,
  TemplateRunTarget,
} from "@/src/features/evals/v2/types/templateGallery";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/evaluators/sourceCodeLanguageLabel";

const GALLERY_TEMPLATE_ICONS: Record<string, LucideIcon> = {
  "book-open-check": BookOpenCheck,
  "building-2": Building2,
  "circle-check": CircleCheck,
  "code-2": Code2,
  equal: Equal,
  "file-search": FileSearch,
  frown: Frown,
  gauge: Gauge,
  languages: Languages,
  "list-checks": ListChecks,
  "list-filter": ListFilter,
  "message-square": MessageSquare,
  "messages-square": MessagesSquare,
  scale: Scale,
  "scan-search": ScanSearch,
  shield: Shield,
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  "shield-x": ShieldX,
  sparkles: Sparkles,
  tags: Tags,
  target: Target,
  type: Type,
};

export type GalleryTemplatePresentation = {
  description: string | undefined;
  type: EvalTemplateType;
  icon: LucideIcon;
  returnTypeLabel: string | null;
  runsOn: TemplateRunTarget[] | null;
  expectedOutputHint?: ExpectedOutputHint;
  attribution: string | null;
};

function managedReturnTypeLabel(
  evaluator: ManagedTemplate["evaluator"],
): string | null {
  if (evaluator.type !== EvalTemplateTypeEnum.LLM_AS_JUDGE) {
    return null;
  }

  return "dataType" in evaluator.outputDefinition
    ? evaluator.outputDefinition.dataType
    : null;
}

function managedPresentation(
  template: ManagedTemplate,
): GalleryTemplatePresentation {
  return {
    description: template.description,
    type: template.evaluator.type,
    icon: GALLERY_TEMPLATE_ICONS[template.icon] ?? Sparkles,
    returnTypeLabel: managedReturnTypeLabel(template.evaluator),
    runsOn: template.runsOn,
    expectedOutputHint: template.expectedOutputHint,
    attribution: null,
  };
}

function customPresentation(
  template: CustomEvaluatorTemplate,
): GalleryTemplatePresentation {
  const codeFallback =
    template.type === EvalTemplateTypeEnum.CODE
      ? `${sourceCodeLanguageLabel(template.sourceCodeLanguage)} evaluator${
          template.version > 1 ? ` · version ${template.version}` : ""
        }`
      : undefined;
  const author =
    template.createdByUser?.name ?? template.createdByUser?.email ?? null;
  const updated = formatDistanceToNowStrict(new Date(template.updatedAt), {
    addSuffix: true,
  });

  return {
    description: template.prompt?.trim() ? template.prompt : codeFallback,
    type: template.type,
    icon: User,
    returnTypeLabel: null,
    runsOn: null,
    expectedOutputHint: undefined,
    attribution: author ? `by ${author} · ${updated}` : `Updated ${updated}`,
  };
}

export function getGalleryTemplatePresentation(
  template: GalleryTemplate,
): GalleryTemplatePresentation {
  return template.source === "managed"
    ? managedPresentation(template)
    : customPresentation(template);
}

export function getGalleryTemplateId(template: GalleryTemplate) {
  return template.source === "managed" ? template.key : template.id;
}
