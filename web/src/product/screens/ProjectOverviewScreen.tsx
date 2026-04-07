import { useRouter } from "next/router";
import { GreenfieldOnboardingView } from "@/src/features/greenfield/components/GreenfieldOnboardingView";
import { useQueryProject } from "@/src/features/projects/hooks";
import { ProjectFrame } from "../frames/ProjectFrame";
import {
  getProjectPreviewHref,
  getPromptStageHref,
} from "../shell/product-manifest";

export default function ProjectOverviewScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { organization } = useQueryProject();

  if (!router.isReady || !projectId) {
    return null;
  }

  return (
    <ProjectFrame
      projectId={projectId}
      activeSection="overview"
      title="Home"
      breadcrumbs={[
        { name: "Project", href: getProjectPreviewHref(projectId) },
        { name: "Home" },
      ]}
    >
      <GreenfieldOnboardingView
        projectId={projectId}
        organizationId={organization?.id}
        iterateHref={getPromptStageHref(
          projectId,
          ["support", "triage-agent"],
          "iterate",
        )}
        iterateLabel="Open Iterate"
      />
    </ProjectFrame>
  );
}
