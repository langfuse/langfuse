// The rbac feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
//
// Access helpers live in utils/ and mix a React hook with TRPC throws
// in the same file. Re-exporting them here does not change the bundle
// versus today's deep import of those files.
//
// `server/` is deliberately absent: membersRouter stays a direct import
// from the tRPC root, which is not a feature.
//
// Members and invites tables stay off this door. onboardingService and
// other server modules already import the access helpers from here, and
// putting those tables on the barrel pulled CreateProjectMemberDialog
// (react-hook-form) into instrumentation and API routes.
//
// The role catalog (definitions, policies, tags, and access-right tables)
// lives in `@langfuse/shared/rbac`; only policy resolution stays here.
export {
  hasProjectAccess,
  throwIfNoProjectAccess,
  useHasProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";

export {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
  useHasOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";

export {
  organizationRoleAccessRights,
  type OrganizationScope,
} from "@langfuse/shared/rbac";
