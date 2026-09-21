// The rbac feature's public surface (RFC rule 8). Named re-exports only —
// this is the whole list of what anything outside the feature may use, and it
// starts as exactly what they already imported, nothing added for the future.
//
// Access helpers live in utils/ and mix a React hook with TRPC throws in the
// same file. Re-exporting them here does not change the bundle versus today's
// deep import of those files. `server/` is deliberately absent: membersRouter
// stays a direct import from the tRPC root, which is not a feature.

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
