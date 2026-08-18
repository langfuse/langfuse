export const EVALUATOR_GALLERY_PREVIEW_SIZE = 6;
export const EVALUATOR_GALLERY_PROJECT_SECTION_KEY = "custom";
export const EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY = "recommended";
export const EVALUATOR_GALLERY_ALL_SECTION_KEY = "all";
export const EVALUATOR_GALLERY_EXPANDED_PROJECT_LIMIT = 100;

export const EVALUATOR_GALLERY_CATEGORY_ICON_CLASS: Record<string, string> = {
  [EVALUATOR_GALLERY_ALL_SECTION_KEY]: "text-muted-foreground",
  [EVALUATOR_GALLERY_PROJECT_SECTION_KEY]: "text-muted-foreground",
  [EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY]: "text-dark-yellow",
  conversation: "text-dark-violet",
  quality: "text-dark-yellow",
  classifier: "text-dark-blue",
  retrieval: "text-dark-teal",
  safety: "text-dark-red",
  "coding-agents": "text-dark-green",
};
