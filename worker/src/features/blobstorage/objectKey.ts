export const buildBlobExportObjectPrefix = ({
  prefix,
  projectId,
  integrationId,
}: {
  prefix?: string;
  projectId: string;
  integrationId: string;
}): string => {
  const ownerPrefix = `${prefix ?? ""}${projectId}/`;
  return integrationId === projectId
    ? ownerPrefix
    : `${ownerPrefix}${integrationId}/`;
};
