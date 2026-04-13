import Page from "@/src/components/layouts/page";
import { useQueryProject } from "@/src/features/projects/hooks";
import { GreenfieldDocSignals } from "@/src/product/components/GreenfieldDocSignals";
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
        className: "bg-white [&_.bg-header]:bg-white",
      }}
    >
      <div className="-m-3 flex min-h-full flex-1 flex-col bg-white p-3">
        <GreenfieldDocSignals section="overview" className="-mx-3 -mt-3" />
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
      </div>
    </Page>
  );
}
