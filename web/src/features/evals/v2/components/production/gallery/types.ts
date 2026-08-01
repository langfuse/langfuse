import type { LucideIcon } from "lucide-react";
import type { RouterOutputs } from "@/src/utils/api";

export type EvaluatorTemplate = RouterOutputs["evalsV2"]["catalog"][number];

export type GalleryTemplate = EvaluatorTemplate & {
  createdByUser?: { name: string | null; email: string | null } | null;
};

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
