type DashboardBlocksCapabilityError = {
  message: string;
  data?: { code?: string; httpStatus?: number; path?: string } | null;
};

export function hasDashboardBlocksLoadError({
  capabilitiesError,
  savedFailed,
}: {
  capabilitiesError: DashboardBlocksCapabilityError | null;
  savedFailed: boolean;
}) {
  if (savedFailed) return true;
  if (capabilitiesError === null) return false;
  const path = "dashboardBlocks.capabilities";
  if (
    capabilitiesError.data?.code !== "NOT_FOUND" ||
    capabilitiesError.data.httpStatus !== 404 ||
    capabilitiesError.data.path !== path
  )
    return true;
  return ![
    `No procedure found on path "${path}"`,
    `No "query"-procedure on path "${path}"`,
  ].includes(capabilitiesError.message);
}
