import type { LucideIcon } from "lucide-react";

export type GalleryTemplate = {
  id: string;
  name: string;
  type: "CODE" | "LLM_AS_JUDGE";
  prompt: string | null;
  sourceCodeLanguage?: "PYTHON" | "TYPESCRIPT" | null;
  projectId: string | null;
  partner: string | null;
  updatedAt: Date;
  version: number;
  createdByUser?: { name: string | null; email: string | null } | null;
};

export type EvaluatorTemplate = GalleryTemplate;

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
