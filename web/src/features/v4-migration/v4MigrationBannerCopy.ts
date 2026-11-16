export const V4_MIGRATION_TOP_BANNER_MESSAGE =
  "Action required: After November 16, 2026, some features may stop working for at least one of your projects.";

export const V4_MIGRATION_EXTENDED_DEADLINE_MESSAGE =
  "Action required: Deadline extended by one week, until November 23, 2026. Some features may stop working after that for at least one of your projects.";

export const V4_MIGRATION_BROWNOUT_MESSAGE =
  "If a feature does not work, it may be in a scheduled brownout.";

export const V4_MIGRATION_STATUS_HREF = "/v4-migration";
export const V4_MIGRATION_STATUS_LINK_LABEL = "Check migration status";
export const V4_MIGRATION_STATUS_MOBILE_LABEL = "Action required:";

export const V4_BROWNOUT_STATUS_URL = "https://status.langfuse.com";
export const V4_BROWNOUT_LINK_LABEL = "See brownout times";
export const V4_BROWNOUT_MOBILE_LABEL = "If a feature does not work:";

export type V4MigrationBannerVariant = "deadline" | "extended" | "brownout";

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

const EXTENDED: V4MigrationBannerPresentation = {
  variant: "extended",
  message: V4_MIGRATION_EXTENDED_DEADLINE_MESSAGE,
  ...migrationLink,
};

const BROWNOUT: V4MigrationBannerPresentation = {
  variant: "brownout",
  message: V4_MIGRATION_BROWNOUT_MESSAGE,
  href: V4_BROWNOUT_STATUS_URL,
  linkLabel: V4_BROWNOUT_LINK_LABEL,
  mobileLabel: V4_BROWNOUT_MOBILE_LABEL,
};

/**
 * One sentence for the whole session. A freeze-list project outside an
 * extended organization shows the brownout. November 23 shows only when every
 * actionable project is in an extended organization. Otherwise November 16.
 */
export function resolveV4MigrationBannerCopy(params: {
  actionNeededProjects: readonly { projectId: string; orgId: string }[];
  brownoutProjectIds: readonly string[];
  extendedOrgIds: readonly string[];
}): V4MigrationBannerPresentation {
  const brownoutProjectIds = new Set(params.brownoutProjectIds);
  const extendedOrgIds = new Set(params.extendedOrgIds);
  let extendedCount = 0;

  for (const project of params.actionNeededProjects) {
    if (extendedOrgIds.has(project.orgId)) {
      extendedCount += 1;
    } else if (brownoutProjectIds.has(project.projectId)) {
      return BROWNOUT;
    }
  }

  return extendedCount > 0 &&
    extendedCount === params.actionNeededProjects.length
    ? EXTENDED
    : DEADLINE;
}
