import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  useIsInAppAgentLauncherVisible,
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
  // Launcher visibility, not `useCanUseInAppAgent`: with org AI features off
  // the action still shows and `openAssistant` opens the dialog that turns
  // them on, exactly like every other assistant entry point.
  const isAssistantLauncherVisible = useIsInAppAgentLauncherVisible();
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
    const openedAssistant = openAssistant("evaluators_empty_state");
    capture("evaluators:empty_state_detect_topics", {
      openedAssistant,
    });

    // False means the enable-AI-features dialog took over; the prompt would be
    // submitted into an assistant the user cannot reach yet.
    if (!openedAssistant) {
      return;
    }

    submit(DETECT_TOPICS_ASSISTANT_PROMPT, {
      newConversation: true,
      entryPoint: "evaluators-empty-state",
    }).catch(() => undefined);
  };

  return (
    <div className="max-h-full overflow-y-auto">
      <EvaluatorsEmptyStateView
        startingPoints={emptyState.startingPoints}
        templateCount={emptyState.templateCount}
        docsHref={emptyState.docsHref}
        onSelectTemplate={handleSelectTemplate}
        onDetectTopics={
          isAssistantLauncherVisible ? handleDetectTopics : undefined
        }
        onBrowseLibrary={() => {
          capture("evaluators:empty_state_browse_library");
          onBrowseLibrary();
        }}
      />
    </div>
  );
}
