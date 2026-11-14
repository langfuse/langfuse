import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";
import {
  isForceV3ExperienceProject,
  shouldSkipScoresDedup,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { isGatewayEnabledForOrganization } from "@/src/features/ai-gateway/server/availability";
import {
  canToggleV4,
  isV4UpgradeUiAvailable,
} from "@/src/features/events/lib/v4Rollout";
import {
  parseFlags,
  parseFlagsWithOrganizationDefaults,
} from "@/src/features/feature-flags/server/parseFlags";
import { type Flags } from "@/src/features/feature-flags/types";
import { canCreateOrganizations } from "@/src/features/organizations/server/canCreateOrganizations";
import {
  type OrganizationProject,
  type OrganizationWithProjects,
} from "./organizationRepository";
import { type PrincipalProject, type PrincipalUser } from "./types";
import { type UserRecord } from "./userRepository";

/** toPrincipalUser derives a user's profile and v4, flag and org-creation capabilities from their row and the orgs they are a member of. */
export function toPrincipalUser(
  user: UserRecord,
  memberOrgs: OrganizationWithProjects[],
): PrincipalUser {
  const rollout = v4Rollout();
  const v4BetaEnabled = isV4BetaEnabled(rollout, user);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt.toISOString(),
    hasPassword: user.hasPassword,
    featureFlags: parseFlags(user.featureFlags, { v4BetaEnabled }),
    v4BetaEnabled,
    v4UpgradeUiAvailable: isV4UpgradeUiAvailable(rollout),
    canToggleV4: isV4Toggleable(rollout, user, memberOrgs),
    canCreateOrganizations: canCreateOrganizations(user.email),
  };
}

/** toPrincipalProject derives a live project's display attributes and deployment allowlist flags. */
export function toPrincipalProject(
  project: OrganizationProject,
): PrincipalProject {
  return {
    id: project.id,
    name: project.name,
    retentionDays: project.retentionDays,
    hasTraces: project.hasTraces,
    metadata: (project.metadata as Record<string, unknown> | null) ?? {},
    createdAt: project.createdAt.toISOString(),
    topicsEnabled: isTopicsProjectEnabled(project.id),
    scoreEditsDisabled: shouldSkipScoresDedup(project.id),
    forceV3Experience: isForceV3ExperienceProject(project.id),
  };
}

/** toUserFeatureFlags resolves a user's stored flags against an org's defaults and gateway availability. */
export function toUserFeatureFlags(
  userFlags: string[],
  org: OrganizationWithProjects,
  v4BetaEnabled: boolean,
): Flags {
  return parseFlagsWithOrganizationDefaults(
    userFlags,
    org.featureFlagOrgDefaults,
    {
      v4BetaEnabled,
      aiGatewayEnabled: isGatewayEnabledForOrganization(org.id),
    },
  );
}

/** v4Rollout reads the deployment's v4 write mode and whether its dual mode offers the preview. */
function v4Rollout(): V4Rollout {
  const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
  return {
    isLangfuseCloud,
    v4WriteMode: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
    dualPreviewAvailable:
      isLangfuseCloud ||
      env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
  };
}

/** isV4BetaEnabled reports whether the user reads through the v4 events tables. */
function isV4BetaEnabled(rollout: V4Rollout, user: UserRecord): boolean {
  if (rollout.v4WriteMode === "events_only") return true;
  return isDualPreview(rollout) && user.v4BetaEnabled === true;
}

/** isV4Toggleable reports whether the user may switch the v4 preview on and off. */
function isV4Toggleable(
  rollout: V4Rollout,
  user: UserRecord,
  memberOrgs: OrganizationWithProjects[],
): boolean {
  if (!isDualPreview(rollout)) return false;
  if (!rollout.isLangfuseCloud) return true;
  return canToggleV4({
    userCreatedAt: user.createdAt,
    organizations: memberOrgs.map((org) => ({
      id: org.id,
      createdAt: org.createdAt,
    })),
    excludedOrganizationIds: excludedRolloutOrgIds(),
  });
}

/** isDualPreview reports whether the deployment writes both table sets and offers the preview. */
function isDualPreview(rollout: V4Rollout): boolean {
  return rollout.v4WriteMode === "dual" && rollout.dualPreviewAvailable;
}

/** excludedRolloutOrgIds is the demo org, which never influences the v4 rollout. */
function excludedRolloutOrgIds(): string[] {
  if (!env.NEXT_PUBLIC_DEMO_ORG_ID) return [];
  return [env.NEXT_PUBLIC_DEMO_ORG_ID];
}

/** V4Rollout is the deployment's v4 write mode and preview availability. */
type V4Rollout = {
  isLangfuseCloud: boolean;
  v4WriteMode: "legacy" | "dual" | "events_only";
  dualPreviewAvailable: boolean;
};
