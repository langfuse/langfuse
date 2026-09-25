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
// rbac/types.ts keeps importing organizationAccessRights by file
// path: it needs the runtime `organizationScopes` value, and routing
// that module through this door would pull the React access hooks into
// the rbac types graph. auth/policy/contextResolver.ts keeps importing
// apiKeyAccessRights by file path for the same reason, and because that
// file already imports auth/policy/types — putting it on this door would
// close a cycle if types ever moved onto the door too.
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
} from "@/src/features/rbac/constants/organizationAccessRights";
