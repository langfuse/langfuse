import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { EvaluatorsEmptyStateView } from "./components/EvaluatorsEmptyStateView/EvaluatorsEmptyStateView";
import { prepareEvaluatorEmptyState } from "@/src/features/evals/v2/fns/templateGallery/prepareEvaluatorEmptyState";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { getTemplateSelectionAnalyticsProperties } from "@/src/features/evals/v2/fns/templateGallery/getTemplateSelectionAnalyticsProperties";

export function EvaluatorsEmptyState({
  onSelectTemplate,
  onBrowseLibrary,
}: {
  onSelectTemplate: (template: GalleryTemplate) => void;
  onBrowseLibrary: () => void;
}) {
  const capture = usePostHogClientCapture();
  const emptyState = prepareEvaluatorEmptyState();

  const handleSelectTemplate = (template: GalleryTemplate) => {
    if (template.source === "managed") {
      capture("evaluators:empty_state_template_select", {
        templateKey: template.key,
      });
    }
    capture("eval:onboarding_started", {
      entryPoint: "empty_state_starting_point",
      hasExistingEvaluators: false,
    });
    capture("eval:onboarding_step_completed", {
      stepName: "suggestion_selected",
      surface: "empty_state",
      ...getTemplateSelectionAnalyticsProperties(template),
    });
    onSelectTemplate(template);
  };

  return (
    <div className="max-h-full overflow-y-auto">
      <EvaluatorsEmptyStateView
        startingPoints={emptyState.startingPoints}
        docsHref={emptyState.docsHref}
        onSelectTemplate={handleSelectTemplate}
        onBrowseLibrary={() => {
          capture("evaluators:empty_state_browse_library");
          capture("eval:onboarding_started", {
            entryPoint: "empty_state_browse_templates",
            hasExistingEvaluators: false,
          });
          onBrowseLibrary();
        }}
      />
    </div>
  );
}
