import { useRouter } from "next/router";
import { PromptFrame } from "../frames/PromptFrame";
import { PlaceholderPage } from "../shell/PlaceholderPage";
import {
  PLACEHOLDER_COPY,
  getPromptBreadcrumbs,
  getPromptStageHref,
  getWorkspaceSelectionLabel,
  resolvePromptPreviewSlug,
} from "../shell/product-manifest";

export default function PromptEvaluateScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { promptPath } = resolvePromptPreviewSlug(router.query.slug);

  if (!router.isReady || !projectId) {
    return null;
  }

  return (
    <PromptFrame
      projectId={projectId}
      title={getWorkspaceSelectionLabel(promptPath)}
      breadcrumbs={getPromptBreadcrumbs(projectId, promptPath)}
      promptPath={promptPath}
      activeStage="evaluate"
    >
      <PlaceholderPage
        label="Evaluate"
        description={PLACEHOLDER_COPY.promptEvaluate}
        route={getPromptStageHref(projectId, promptPath, "evaluate")}
      />
    </PromptFrame>
  );
}
