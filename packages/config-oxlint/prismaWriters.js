const membershipTestWriters = [
  "__tests__/**",
  "*.test.ts",
  "scripts/seeder/**",
];

/**
 * allowedPrismaWriters contains the list of files allowed to write to Prisma collections.
 * Writes are permitted from the entire application unless otherwise specified.
 * Globs match trailing path segments.
 */
export const allowedPrismaWriters = {
  apiKey: allowPrismaCreate("packages/shared/src/server/auth/apiKeys.ts"),
  roleAssignment: allowPrismaCreate(
    "packages/shared/src/features/rbac/roleAssignmentService.ts",
  ),
  organizationMembership: allowPrismaWrites(
    "packages/shared/src/features/memberships/orgMembershipRepository.ts",
    ...membershipTestWriters,
  ),
  projectMembership: allowPrismaWrites(
    "packages/shared/src/features/memberships/projectMembershipRepository.ts",
    ...membershipTestWriters,
  ),
};

/** allowPrismaCreate allows only the given files to create a Prisma model's rows */
function allowPrismaCreate(...files) {
  return { files, create: true };
}

/** allowPrismaWrites allows only the given files to write a Prisma model's rows */
function allowPrismaWrites(...files) {
  return { files, create: true, update: true, delete: true };
}
