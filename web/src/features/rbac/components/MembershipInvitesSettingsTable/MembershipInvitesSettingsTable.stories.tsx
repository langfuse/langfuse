import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { MembershipInvitesSettingsTable } from "./MembershipInvitesSettingsTable";

const meta = preview.meta({ component: MembershipInvitesSettingsTable });

export const Default = meta.story({
  args: {
    showProjectRole: false,
    hasCudAccess: true,
    onDelete: fn(),
    pagination: {
      mode: "offset",
      totalCount: 5,
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
    },
    data: {
      status: "success",
      data: [
        {
          inviteId: "invite-1",
          email: "grace@example.com",
          createdAt: new Date("2026-09-18"),
          orgRole: "MEMBER",
          invitedByUser: { name: "Ada Lovelace", image: null },
        },
        {
          inviteId: "invite-2",
          email: "katherine@example.com",
          createdAt: new Date("2026-09-17"),
          orgRole: "VIEWER",
          invitedByUser: { name: "Grace Hopper", image: null },
        },
        {
          inviteId: "invite-3",
          email: "margaret@example.com",
          createdAt: new Date("2026-09-16"),
          orgRole: "ADMIN",
          invitedByUser: { name: "Ada Lovelace", image: null },
        },
        {
          inviteId: "invite-4",
          email: "dorothy@example.com",
          createdAt: new Date("2026-09-15"),
          orgRole: "MEMBER",
          invitedByUser: null,
        },
        {
          inviteId: "invite-5",
          email: "mary@example.com",
          createdAt: new Date("2026-09-14"),
          orgRole: "VIEWER",
          invitedByUser: { name: "Grace Hopper", image: null },
        },
      ],
    },
  },
});

export const Loading = meta.story({
  args: {
    showProjectRole: false,
    hasCudAccess: true,
    onDelete: fn(),
    pagination: {
      mode: "offset",
      totalCount: null,
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
    },
    data: { status: "loading" },
  },
});
