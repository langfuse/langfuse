import Page from "@/src/components/layouts/page";
import { useQueryProject } from "@/src/features/projects/hooks";
import { getPromptStageHref } from "@/src/product/shell/product-manifest";
import { GreenfieldOnboardingView } from "../components/GreenfieldOnboardingView";

const DEFAULT_PROMPT_PATH = ["support", "triage-agent"];

export default function GreenfieldOnboardingPage() {
  const { project, organization } = useQueryProject();

  if (!project) {
    return null;
  }

  return (
    <Page
      scrollable
      withPadding
      headerProps={{
        title: "Home",
        showSidebarTrigger: false,
        showTopRow: false,
      }}
    >
      <GreenfieldOnboardingView
        projectId={project.id}
        organizationId={organization?.id}
        iterateHref={getPromptStageHref(
          project.id,
          DEFAULT_PROMPT_PATH,
          "iterate",
        )}
        iterateLabel="Open Prompt Workspace"
      />
    </Page>
  );
}
