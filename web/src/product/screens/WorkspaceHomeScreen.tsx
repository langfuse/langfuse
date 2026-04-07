import { useRouter } from "next/router";
import { ProjectFrame } from "../frames/ProjectFrame";
import { PlaceholderPage } from "../shell/PlaceholderPage";
import {
  PLACEHOLDER_COPY,
  getWorkspaceBreadcrumbs,
  getWorkspacePreviewHref,
} from "../shell/product-manifest";

export default function WorkspaceHomeScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;

  if (!router.isReady || !projectId) {
    return null;
  }

  return (
    <ProjectFrame
      projectId={projectId}
      activeSection="workspace"
      title="Project Workspace"
      breadcrumbs={getWorkspaceBreadcrumbs(projectId, [])}
    >
      <PlaceholderPage
        label="Workspace Home"
        description={PLACEHOLDER_COPY.workspaceHome}
        route={getWorkspacePreviewHref(projectId)}
      />
    </ProjectFrame>
  );
}
