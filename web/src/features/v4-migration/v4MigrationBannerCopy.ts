export const V4_MIGRATION_TOP_BANNER_MESSAGE =
  "Action required: Some features may stop working for at least one of your projects.";

export const V4_MIGRATION_DELAYED_DEADLINE_MESSAGE =
  "Action required: Deadline delayed by one week, until November 23, 2026. Some features may stop working after that for at least one of your projects.";

export const V4_MIGRATION_STATUS_HREF = "/v4-migration";
export const V4_MIGRATION_STATUS_LINK_LABEL = "Check migration status";
export const V4_MIGRATION_STATUS_MOBILE_LABEL = "Action required:";

export type V4MigrationBannerVariant = "deadline" | "delayed";

export type V4MigrationBannerPresentation = {
  variant: V4MigrationBannerVariant;
  message: string;
  href: string;
  linkLabel: string;
  mobileLabel: string;
};

const migrationLink = {
  href: V4_MIGRATION_STATUS_HREF,
  linkLabel: V4_MIGRATION_STATUS_LINK_LABEL,
  mobileLabel: V4_MIGRATION_STATUS_MOBILE_LABEL,
} as const;

const DEADLINE: V4MigrationBannerPresentation = {
  variant: "deadline",
  message: V4_MIGRATION_TOP_BANNER_MESSAGE,
  ...migrationLink,
};

const DELAYED: V4MigrationBannerPresentation = {
  variant: "delayed",
  message: V4_MIGRATION_DELAYED_DEADLINE_MESSAGE,
  ...migrationLink,
};

/**
 * One sentence for the whole session, or none. The delayed deadline shows only
 * when every actionable project is cutoff-exempt; any other actionable project
 * gets the default message.
 */
export function resolveV4MigrationBannerCopy(params: {
  actionNeededProjectIds: readonly string[];
  cutoffExemptProjectIds: readonly string[];
}): V4MigrationBannerPresentation | null {
  const { actionNeededProjectIds } = params;
  if (actionNeededProjectIds.length === 0) {
    return null;
  }

  const cutoffExemptProjectIds = new Set(params.cutoffExemptProjectIds);
  const allExempt = actionNeededProjectIds.every((projectId) =>
    cutoffExemptProjectIds.has(projectId),
  );
  return allExempt ? DELAYED : DEADLINE;
}
