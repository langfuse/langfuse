import {
  ALREADY_ORGANIZATION_MEMBER_MESSAGE,
  ALREADY_PROJECT_MEMBER_MESSAGE,
  PENDING_MEMBERSHIP_INVITE_MESSAGE,
} from "@/src/features/rbac/constants/membershipErrorMessages";

const EMAIL_FIELD_MESSAGES = new Set<string>([
  ALREADY_PROJECT_MEMBER_MESSAGE,
  ALREADY_ORGANIZATION_MEMBER_MESSAGE,
  PENDING_MEMBERSHIP_INVITE_MESSAGE,
]);

export type MemberInviteErrorField = "email" | "root";

/** placeMemberInviteError chooses the invite field that can show the server message. */
export function placeMemberInviteError(error: unknown): {
  field: MemberInviteErrorField;
  message: string;
} {
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Failed to add member";

  if (EMAIL_FIELD_MESSAGES.has(message)) {
    return { field: "email", message };
  }
  return { field: "root", message };
}
