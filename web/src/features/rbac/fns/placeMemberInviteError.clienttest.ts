import { describe, expect, it } from "vitest";

import { organizationMemberLimitMessage } from "@/src/features/entitlements/constants/organizationMemberLimitMessage";
import { placeMemberInviteError } from "@/src/features/rbac/fns/placeMemberInviteError";
import {
  ALREADY_ORGANIZATION_MEMBER_MESSAGE,
  ALREADY_PROJECT_MEMBER_MESSAGE,
  PENDING_MEMBERSHIP_INVITE_MESSAGE,
} from "@/src/features/rbac/constants/membershipErrorMessages";

describe("placeMemberInviteError", () => {
  it.each([
    ALREADY_PROJECT_MEMBER_MESSAGE,
    ALREADY_ORGANIZATION_MEMBER_MESSAGE,
    PENDING_MEMBERSHIP_INVITE_MESSAGE,
  ])("puts %s on the email field", (message) => {
    expect(placeMemberInviteError(new Error(message))).toEqual({
      field: "email",
      message,
    });
  });

  it("uses a form message for the seat limit and for anything else", () => {
    const seatLimit = organizationMemberLimitMessage(2, 2);
    expect(placeMemberInviteError(new Error(seatLimit))).toEqual({
      field: "root",
      message: seatLimit,
    });
    expect(
      placeMemberInviteError(new Error("The member could not be added.")),
    ).toEqual({
      field: "root",
      message: "The member could not be added.",
    });
    expect(placeMemberInviteError("nope")).toEqual({
      field: "root",
      message: "Failed to add member",
    });
  });
});
