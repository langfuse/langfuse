import { createBreadcrumbItems } from "@/src/features/folders/utils";

export const getDatasetBreadcrumb = (
  projectId: string,
  datasetId: string,
  datasetName?: string,
) => {
  const segments = (datasetName ?? "")
    .split("/")
    .filter((segment) => segment.trim());
  const folderPath = segments.length > 1 ? segments.slice(0, -1).join("/") : "";
  const breadcrumbItems = folderPath ? createBreadcrumbItems(folderPath) : [];
  const datasetDisplayName =
    segments.length > 0 ? segments[segments.length - 1] : undefined;

  return [
    { name: "Datasets", href: `/project/${projectId}/datasets` },
    ...breadcrumbItems.map((item) => ({
      name: item.name,
      href: `/project/${projectId}/datasets?folder=${encodeURIComponent(item.folderPath)}`,
    })),
    ...(datasetDisplayName
      ? [
          {
            name: datasetDisplayName,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
        ]
      : []),
  ];
};
