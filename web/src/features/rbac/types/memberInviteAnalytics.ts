import type { Role } from "@langfuse/shared";

// Member invite funnel: dialog opened -> submitted. Metadata only: roles,
// counts and the placement. Never email addresses or their domains.

/** Where the invite dialog was opened from. */
export type MemberInviteSurface =
  | "members_settings"
  | "annotation_queues_empty_state"
  | "comments"
  | "trace_share"
  | "annotation_queue_assignment";

/**
 * How the addresses fit the open seats: `none` without a member limit,
 * `last` when they take exactly the seats left (one, before any is added),
 * `full` once no seat is open.
 */
export type MemberInviteSeatState = "none" | "open" | "last" | "over" | "full";

type SendMembershipInvitationProperties = {
  orgRole: Role;
  projectRole: Role;
  /** Addresses in the submit, after deduplication. */
  emailCount: number;
  surface: MemberInviteSurface;
  seatState: MemberInviteSeatState;
};

export type MembersEventMap = {
  "members:invite_dialog_open": {
    surface: MemberInviteSurface;
    /** Whether the organization's plan caps its member seats. */
    hasUsageLimit: boolean;
    seatState: MemberInviteSeatState;
  };
  "members:invite_upgrade_click": {
    surface: MemberInviteSurface;
    seatState: MemberInviteSeatState;
    /** Addresses in the input when the upgrade link was clicked. */
    emailCount: number;
    /** Whether the clicker can manage billing. */
    isOwner: boolean;
  };
  "organization_settings:send_membership_invitation": SendMembershipInvitationProperties;
  "project_settings:send_membership_invitation": SendMembershipInvitationProperties;
};
