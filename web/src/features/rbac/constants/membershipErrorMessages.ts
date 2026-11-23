/**
 * Sentences `members.create` returns when the address cannot be invited.
 * A concurrent insert hits the membership unique constraint.
 * `rethrowIfMembershipExists` in `@langfuse/shared` returns the same
 * already-member sentences as a 409.
 */
export const ALREADY_PROJECT_MEMBER_MESSAGE =
  "User is already a member of this project";

export const ALREADY_ORGANIZATION_MEMBER_MESSAGE =
  "User is already a member of this organization";

export const PENDING_MEMBERSHIP_INVITE_MESSAGE =
  "A pending membership invitation with this email and organization already exists";
