import { useRouter } from "next/router";
import { ProjectFrame } from "../frames/ProjectFrame";
import { PlaceholderPage } from "../shell/PlaceholderPage";
import {
  PLACEHOLDER_COPY,
  decodePathSegments,
  getFolderPreviewHref,
  getWorkspaceBreadcrumbs,
  getWorkspaceSelectionLabel,
} from "../shell/product-manifest";

export default function WorkspaceFolderScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const folderPath = decodePathSegments(router.query.folderPath);

  if (!router.isReady || !projectId) {
    return null;
  }

  return (
    <ProjectFrame
      projectId={projectId}
      title={getWorkspaceSelectionLabel(folderPath)}
      breadcrumbs={getWorkspaceBreadcrumbs(projectId, folderPath)}
      workspaceSelection={{ kind: "folder", path: folderPath }}
    >
      <PlaceholderPage
        label="Workspace Folder"
        description={PLACEHOLDER_COPY.workspaceFolder}
        route={getFolderPreviewHref(projectId, folderPath)}
      />
    </ProjectFrame>
  );
}
