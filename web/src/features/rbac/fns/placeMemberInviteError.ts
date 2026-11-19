import {
  ALREADY_ORGANIZATION_MEMBER_MESSAGE,
  ALREADY_PROJECT_MEMBER_MESSAGE,
  ORGANIZATION_ROLE_TOO_HIGH_MESSAGE,
  PENDING_MEMBERSHIP_INVITE_MESSAGE,
  PROJECT_ROLE_TOO_HIGH_MESSAGE,
} from "@/src/features/rbac/constants/membershipErrorMessages";

const EMAIL_FIELD_MESSAGES = new Set<string>([
  ALREADY_PROJECT_MEMBER_MESSAGE,
  ALREADY_ORGANIZATION_MEMBER_MESSAGE,
  PENDING_MEMBERSHIP_INVITE_MESSAGE,
]);

export type MemberInviteErrorField =
  | "email"
  | "orgRole"
  | "projectRole"
  | "root";

/** placeMemberInviteError chooses the invite field that can show the server message. */
export function placeMemberInviteError(
  error: unknown,
  fields: { orgRole: boolean; projectRole: boolean },
): { field: MemberInviteErrorField; message: string } {
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Failed to add member";

  if (EMAIL_FIELD_MESSAGES.has(message)) {
    return { field: "email", message };
  }
  if (message === ORGANIZATION_ROLE_TOO_HIGH_MESSAGE && fields.orgRole) {
    return { field: "orgRole", message };
  }
  if (message === PROJECT_ROLE_TOO_HIGH_MESSAGE && fields.projectRole) {
    return { field: "projectRole", message };
  }
  return { field: "root", message };
}
