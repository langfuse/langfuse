import { useRouter } from "next/router";
import { WorkspaceFolderOverview } from "../components/WorkspaceFolderOverview";
import { ProjectFrame } from "../frames/ProjectFrame";
import {
  decodePathSegments,
  getWorkspaceBreadcrumbs,
} from "../shell/product-manifest";

export default function WorkspaceFolderScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const folderPath = decodePathSegments(router.query.folderPath);

  if (!router.isReady || !projectId || folderPath.length === 0) {
    return null;
  }

  return (
    <ProjectFrame
      projectId={projectId}
      breadcrumbs={getWorkspaceBreadcrumbs(projectId, folderPath)}
      workspaceSelection={{ kind: "folder", path: folderPath }}
    >
      <WorkspaceFolderOverview projectId={projectId} folderPath={folderPath} />
    </ProjectFrame>
  );
}
