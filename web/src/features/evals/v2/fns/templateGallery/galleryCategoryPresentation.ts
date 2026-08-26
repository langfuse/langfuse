import {
  Code2,
  FileSearch,
  Gauge,
  LayoutGrid,
  Lightbulb,
  ListFilter,
  MessagesSquare,
  Shield,
  User,
  type LucideIcon,
} from "lucide-react";

import {
  EVALUATOR_GALLERY_ALL_SECTION_KEY,
  EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
  EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  EVALUATOR_GALLERY_SAFETY_SECTION_KEY,
} from "@/src/features/evals/v2/constants/evaluatorGallery";

export type GalleryCategoryPresentation = {
  icon: LucideIcon;
  iconClassName: string;
};

const FALLBACK_PRESENTATION: GalleryCategoryPresentation = {
  icon: LayoutGrid,
  iconClassName: "text-muted-foreground",
};

export const GALLERY_CATEGORY_PRESENTATION: Record<
  string,
  GalleryCategoryPresentation
> = {
  [EVALUATOR_GALLERY_ALL_SECTION_KEY]: {
    icon: LayoutGrid,
    iconClassName: "text-muted-foreground",
  },
  [EVALUATOR_GALLERY_PROJECT_SECTION_KEY]: {
    icon: User,
    iconClassName: "text-muted-foreground",
  },
  [EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY]: {
    icon: Lightbulb,
    iconClassName: "text-dark-yellow",
  },
  conversation: {
    icon: MessagesSquare,
    iconClassName: "text-dark-violet",
  },
  quality: {
    icon: Gauge,
    iconClassName: "text-dark-yellow",
  },
  classifier: {
    icon: ListFilter,
    iconClassName: "text-dark-blue",
  },
  retrieval: {
    icon: FileSearch,
    iconClassName: "text-dark-teal",
  },
  [EVALUATOR_GALLERY_SAFETY_SECTION_KEY]: {
    icon: Shield,
    iconClassName: "text-dark-red",
  },
  "coding-agents": {
    icon: Code2,
    iconClassName: "text-dark-green",
  },
};

export function getGalleryCategoryPresentation(key: string) {
  return GALLERY_CATEGORY_PRESENTATION[key] ?? FALLBACK_PRESENTATION;
}
