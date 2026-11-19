import { describe, expect, it } from "vitest";

import { organizationMemberLimitMessage } from "@/src/features/entitlements/constants/organizationMemberLimitMessage";
import { placeMemberInviteError } from "@/src/features/rbac/fns/placeMemberInviteError";
import {
  ALREADY_ORGANIZATION_MEMBER_MESSAGE,
  ALREADY_PROJECT_MEMBER_MESSAGE,
  ORGANIZATION_ROLE_TOO_HIGH_MESSAGE,
  PENDING_MEMBERSHIP_INVITE_MESSAGE,
  PROJECT_ROLE_TOO_HIGH_MESSAGE,
} from "@/src/features/rbac/constants/membershipErrorMessages";

const visible = { orgRole: true, projectRole: true };

describe("placeMemberInviteError", () => {
  it.each([
    ALREADY_PROJECT_MEMBER_MESSAGE,
    ALREADY_ORGANIZATION_MEMBER_MESSAGE,
    PENDING_MEMBERSHIP_INVITE_MESSAGE,
  ])("puts %s on the email field", (message) => {
    expect(placeMemberInviteError(new Error(message), visible)).toEqual({
      field: "email",
      message,
    });
  });

  it("puts an organization role above your own on that select", () => {
    expect(
      placeMemberInviteError(
        new Error(ORGANIZATION_ROLE_TOO_HIGH_MESSAGE),
        visible,
      ),
    ).toEqual({
      field: "orgRole",
      message: ORGANIZATION_ROLE_TOO_HIGH_MESSAGE,
    });
  });

  it("puts a project role above your own on that select", () => {
    expect(
      placeMemberInviteError(new Error(PROJECT_ROLE_TOO_HIGH_MESSAGE), visible),
    ).toEqual({
      field: "projectRole",
      message: PROJECT_ROLE_TOO_HIGH_MESSAGE,
    });
  });

  it("uses a form message when the role select is hidden", () => {
    expect(
      placeMemberInviteError(new Error(ORGANIZATION_ROLE_TOO_HIGH_MESSAGE), {
        orgRole: false,
        projectRole: true,
      }),
    ).toEqual({ field: "root", message: ORGANIZATION_ROLE_TOO_HIGH_MESSAGE });
    expect(
      placeMemberInviteError(new Error(PROJECT_ROLE_TOO_HIGH_MESSAGE), {
        orgRole: true,
        projectRole: false,
      }),
    ).toEqual({ field: "root", message: PROJECT_ROLE_TOO_HIGH_MESSAGE });
  });

  it("uses a form message for the seat limit and for anything else", () => {
    const seatLimit = organizationMemberLimitMessage(2, 2);
    expect(placeMemberInviteError(new Error(seatLimit), visible)).toEqual({
      field: "root",
      message: seatLimit,
    });
    expect(
      placeMemberInviteError(
        new Error("The member could not be added."),
        visible,
      ),
    ).toEqual({
      field: "root",
      message: "The member could not be added.",
    });
    expect(placeMemberInviteError("nope", visible)).toEqual({
      field: "root",
      message: "Failed to add member",
    });
  });
});
