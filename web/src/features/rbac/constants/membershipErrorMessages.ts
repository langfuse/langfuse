/**
 * Sentences `members.create` returns when the address cannot be invited.
 * The unique-constraint path builds the same already-member sentences in
 * `rethrowIfMembershipExists`.
 */
export const ALREADY_PROJECT_MEMBER_MESSAGE =
  "User is already a member of this project";

export const ALREADY_ORGANIZATION_MEMBER_MESSAGE =
  "User is already a member of this organization";

export const PENDING_MEMBERSHIP_INVITE_MESSAGE =
  "A pending membership invitation with this email and organization already exists";

export const ORGANIZATION_ROLE_TOO_HIGH_MESSAGE =
  "You cannot grant or edit an organization role higher than your own.";

export const PROJECT_ROLE_TOO_HIGH_MESSAGE =
  "You cannot grant or edit a project role higher than your own.";
