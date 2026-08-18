import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { EvaluatorsEmptyStateView } from "./components/EvaluatorsEmptyStateView/EvaluatorsEmptyStateView";
import { prepareEvaluatorEmptyState } from "@/src/features/evals/v2/fns/templateGallery/prepareEvaluatorEmptyState";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";

export function EvaluatorsEmptyState({
  onSelectTemplate,
  onBrowseLibrary,
}: {
  onSelectTemplate: (template: GalleryTemplate) => void;
  onBrowseLibrary: () => void;
}) {
  const capture = usePostHogClientCapture();
  const emptyState = prepareEvaluatorEmptyState();

  return (
    <EvaluatorsEmptyStateView
      startingPoints={emptyState.startingPoints}
      templateCount={emptyState.templateCount}
      docsHref={emptyState.docsHref}
      onSelectTemplate={(template) => {
        if (template.source === "managed") {
          capture("evaluators:empty_state_template_select", {
            templateKey: template.key,
          });
        }
        onSelectTemplate(template);
      }}
      onBrowseLibrary={() => {
        capture("evaluators:empty_state_browse_library");
        onBrowseLibrary();
      }}
    />
  );
}
