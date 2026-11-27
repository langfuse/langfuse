/**
 * Why `inviteMember` refuses an address. `rethrowIfMembershipExists` in
 * `@langfuse/shared` raises the same already-member sentences as a 409 when a
 * concurrent insert hits the membership unique constraint.
 */
export const ALREADY_PROJECT_MEMBER_MESSAGE =
  "User is already a member of this project";

export const ALREADY_ORGANIZATION_MEMBER_MESSAGE =
  "User is already a member of this organization";

export const PENDING_MEMBERSHIP_INVITE_MESSAGE =
  "A pending membership invitation with this email and organization already exists";
