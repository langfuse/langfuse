import {
  type PrincipalOrganization,
  type PrincipalProject,
  type PrincipalUser,
} from "@/src/features/auth/policy/types";
import { testFeatureFlags } from "./feature-flags";

/** testPrincipalOrganization is a free-plan org with no projects, overridable per test. */
export const testPrincipalOrganization = (
  overrides: Partial<PrincipalOrganization> = {},
): PrincipalOrganization => ({
  id: "org_1",
  createdAt: "2026-09-16T00:00:00.000Z",
  name: "Org",
  metadata: {},
  plan: "oss",
  rateLimitOverrides: [],
  isIngestionSuspended: false,
  accessAuditLogEnabled: false,
  supportAccess: false,
  aiFeaturesEnabled: false,
  aiTelemetryEnabled: true,
  featureFlagDefaults: testFeatureFlags(),
  cloudConfig: undefined,
  projects: [],
  ...overrides,
});

/** testPrincipalProject is a live project with no allowlist flags, overridable per test. */
export const testPrincipalProject = (
  overrides: Partial<PrincipalProject> = {},
): PrincipalProject => ({
  id: "prj_1",
  name: "Project",
  retentionDays: null,
  hasTraces: false,
  metadata: {},
  createdAt: "2026-09-16T00:00:00.000Z",
  topicsEnabled: false,
  scoreEditsDisabled: false,
  forceV3Experience: false,
  ...overrides,
});

/** testPrincipalUser is a signed-in user without v4 access, overridable per test. */
export const testPrincipalUser = (
  overrides: Partial<PrincipalUser> = {},
): PrincipalUser => ({
  id: "user_1",
  email: "user@example.com",
  name: "User",
  image: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  hasPassword: false,
  featureFlags: testFeatureFlags(),
  v4BetaEnabled: false,
  v4UpgradeUiAvailable: false,
  canToggleV4: false,
  canCreateOrganizations: true,
  ...overrides,
});
