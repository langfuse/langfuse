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

const deadlinePresentation = (
  message: string,
): V4MigrationBannerPresentation => ({
  variant: "deadline",
  message,
  href: V4_MIGRATION_STATUS_HREF,
  linkLabel: V4_MIGRATION_STATUS_LINK_LABEL,
  mobileLabel: V4_MIGRATION_STATUS_MOBILE_LABEL,
});

/**
 * Brownout copy applies when an actionable project is on the freeze list and
 * its organization is outside the one-week extension. An extended organization
 * keeps the deadline banner through November 23. A session that has both sees
 * the brownout, because a feature may already be down. Otherwise the
 * configured deadline sentence stays.
 */
export function resolveV4MigrationBannerCopy(params: {
  actionNeededProjects: readonly { projectId: string; orgId: string }[];
  brownoutProjectIds: readonly string[];
  extendedOrgIds: readonly string[];
  deadlineMessage: string;
}): V4MigrationBannerPresentation {
  const brownoutProjectIds = new Set(params.brownoutProjectIds);
  const extendedOrgIds = new Set(params.extendedOrgIds);
  const hasBrownout = params.actionNeededProjects.some(
    (project) =>
      brownoutProjectIds.has(project.projectId) &&
      !extendedOrgIds.has(project.orgId),
  );
  if (hasBrownout) {
    return {
      variant: "brownout",
      message: V4_MIGRATION_BROWNOUT_MESSAGE,
      href: V4_BROWNOUT_STATUS_URL,
      linkLabel: V4_BROWNOUT_LINK_LABEL,
      mobileLabel: V4_BROWNOUT_MOBILE_LABEL,
    };
  }

  const hasExtendedDeadline = params.actionNeededProjects.some((project) =>
    extendedOrgIds.has(project.orgId),
  );
  if (hasExtendedDeadline) {
    return {
      variant: "extended",
      message: V4_MIGRATION_EXTENDED_DEADLINE_MESSAGE,
      href: V4_MIGRATION_STATUS_HREF,
      linkLabel: V4_MIGRATION_STATUS_LINK_LABEL,
      mobileLabel: V4_MIGRATION_STATUS_MOBILE_LABEL,
    };
  }

  return deadlinePresentation(params.deadlineMessage);
}
