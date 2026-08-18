import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  useCanUseInAppAgent,
  useInAppAiAgent,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { DETECT_TOPICS_ASSISTANT_PROMPT } from "@/src/features/evals/v2/constants/evaluatorEmptyState";
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
  const canUseAssistant = useCanUseInAppAgent();
  const { openAssistant, submit } = useInAppAiAgent();
  const emptyState = prepareEvaluatorEmptyState();

  const handleSelectTemplate = (template: GalleryTemplate) => {
    if (template.source === "managed") {
      capture("evaluators:empty_state_template_select", {
        templateKey: template.key,
      });
    }
    onSelectTemplate(template);
  };

  const handleDetectTopics = () => {
    if (canUseAssistant) {
      capture("evaluators:empty_state_detect_topics", {
        openedAssistant: true,
      });

      if (!openAssistant("evaluators_empty_state")) {
        return;
      }

      submit(DETECT_TOPICS_ASSISTANT_PROMPT, {
        newConversation: true,
        entryPoint: "evaluators-empty-state",
      }).catch(() => undefined);
      return;
    }

    capture("evaluators:empty_state_detect_topics", {
      openedAssistant: false,
    });

    const detectTopics = emptyState.startingPoints.find(
      (startingPoint) => startingPoint.action === "detect-topics",
    );

    if (detectTopics) {
      onSelectTemplate(detectTopics.template);
    }
  };

  return (
    <div className="max-h-full overflow-y-auto">
      <EvaluatorsEmptyStateView
        startingPoints={emptyState.startingPoints}
        templateCount={emptyState.templateCount}
        docsHref={emptyState.docsHref}
        onSelectTemplate={handleSelectTemplate}
        onDetectTopics={handleDetectTopics}
        onBrowseLibrary={() => {
          capture("evaluators:empty_state_browse_library");
          onBrowseLibrary();
        }}
      />
    </div>
  );
}
