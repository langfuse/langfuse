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
  EVALUATOR_GALLERY_CATEGORY_ICON_CLASS,
  EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
  EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
} from "@/src/features/evals/v2/constants/evaluatorGallery";

export const GALLERY_CATEGORY_ICONS: Record<string, LucideIcon> = {
  [EVALUATOR_GALLERY_ALL_SECTION_KEY]: LayoutGrid,
  [EVALUATOR_GALLERY_PROJECT_SECTION_KEY]: User,
  [EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY]: Lightbulb,
  conversation: MessagesSquare,
  quality: Gauge,
  classifier: ListFilter,
  retrieval: FileSearch,
  safety: Shield,
  "coding-agents": Code2,
};

export function getGalleryCategoryPresentation(key: string) {
  return {
    icon: GALLERY_CATEGORY_ICONS[key] ?? LayoutGrid,
    iconClassName:
      EVALUATOR_GALLERY_CATEGORY_ICON_CLASS[key] ?? "text-muted-foreground",
  };
}
