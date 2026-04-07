import { useRouter } from "next/router";
import { DatasetFrame } from "../frames/DatasetFrame";
import { PlaceholderPage } from "../shell/PlaceholderPage";
import {
  PLACEHOLDER_COPY,
  decodePathSegments,
  getDatasetBreadcrumbs,
  getDatasetPreviewHref,
  getWorkspaceSelectionLabel,
} from "../shell/product-manifest";

export default function DatasetScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const datasetPath = decodePathSegments(router.query.datasetPath);

  if (!router.isReady || !projectId) {
    return null;
  }

  return (
    <DatasetFrame
      projectId={projectId}
      title={getWorkspaceSelectionLabel(datasetPath)}
      breadcrumbs={getDatasetBreadcrumbs(projectId, datasetPath)}
      datasetPath={datasetPath}
    >
      <PlaceholderPage
        label="Dataset Asset"
        description={PLACEHOLDER_COPY.dataset}
        route={getDatasetPreviewHref(projectId, datasetPath)}
      />
    </DatasetFrame>
  );
}
