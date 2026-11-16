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
 * One sentence for the whole session, or none. A freeze-list project that is
 * not cutoff-exempt shows the brownout. November 23 shows only when every
 * actionable project is cutoff-exempt.
 */
export function resolveV4MigrationBannerCopy(params: {
  actionNeededProjectIds: readonly string[];
  brownoutProjectIds: readonly string[];
  cutoffExemptProjectIds: readonly string[];
}): V4MigrationBannerPresentation | null {
  const brownoutProjectIds = new Set(params.brownoutProjectIds);
  const cutoffExemptProjectIds = new Set(params.cutoffExemptProjectIds);
  let exemptCount = 0;

  for (const projectId of params.actionNeededProjectIds) {
    if (cutoffExemptProjectIds.has(projectId)) {
      exemptCount += 1;
    } else if (brownoutProjectIds.has(projectId)) {
      return BROWNOUT;
    }
  }

  return exemptCount > 0 && exemptCount === params.actionNeededProjectIds.length
    ? EXTENDED
    : null;
}
