import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";

// Managed template keys are Langfuse-owned; custom (project) templates are
// reported only as custom, never by id or name.
export function getTemplateSelectionAnalyticsProperties(
  template: GalleryTemplate,
) {
  return template.source === "managed"
    ? {
        evaluatorType: template.evaluator.type,
        managedTemplateKey: template.key,
        isCustomTemplate: false,
      }
    : { evaluatorType: template.type, isCustomTemplate: true };
}
