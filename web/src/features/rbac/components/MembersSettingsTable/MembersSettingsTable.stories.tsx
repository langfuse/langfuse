import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { MembersSettingsTable } from "./MembersSettingsTable";

const meta = preview.meta({ component: MembersSettingsTable });

export const Default = meta.story({
  args: {
    orgId: "org-1",
    hasOrgCudAccess: true,
    hasProjectCudAccess: false,
    projectRolesEntitlement: true,
    showFeaturePreviews: false,
    isUpdatingRole: false,
    onDelete: fn(),
    onUpdateOrgRole: fn(),
    onUpdateProjectRole: fn(),
    search: { value: "", onChange: fn() },
    toolbarActions: [
      { id: "add-member", label: "Add new member", onClick: fn() },
    ],
    pagination: {
      totalCount: 5,
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
    },
    data: {
      status: "success",
      data: [
        {
          user: { name: "Ada Lovelace", image: null },
          email: "ada@example.com",
          providers: ["google"],
          createdAt: new Date("2026-09-01"),
          orgRole: "ADMIN",
          featurePreviews: null,
          featurePreviewManagement: null,
          meta: { userId: "user-1", orgMembershipId: "membership-1" },
        },
        {
          user: { name: "Grace Hopper", image: null },
          email: "grace@example.com",
          providers: ["github"],
          createdAt: new Date("2026-08-14"),
          orgRole: "MEMBER",
          featurePreviews: null,
          featurePreviewManagement: null,
          meta: { userId: "user-2", orgMembershipId: "membership-2" },
        },
        {
          user: { name: "Katherine Johnson", image: null },
          email: "katherine@example.com",
          providers: [],
          createdAt: new Date("2026-07-03"),
          orgRole: "VIEWER",
          featurePreviews: null,
          featurePreviewManagement: null,
          meta: { userId: "user-3", orgMembershipId: "membership-3" },
        },
        {
          user: { name: "Margaret Hamilton", image: null },
          email: "margaret@example.com",
          providers: ["google", "github"],
          createdAt: new Date("2026-06-21"),
          orgRole: "ADMIN",
          featurePreviews: null,
          featurePreviewManagement: null,
          meta: { userId: "user-4", orgMembershipId: "membership-4" },
        },
        {
          user: { name: "Dorothy Vaughan", image: null },
          email: "dorothy@example.com",
          providers: ["email"],
          createdAt: new Date("2026-05-09"),
          orgRole: "MEMBER",
          featurePreviews: null,
          featurePreviewManagement: null,
          meta: { userId: "user-5", orgMembershipId: "membership-5" },
        },
      ],
    },
  },
});

export const Loading = meta.story({
  args: {
    orgId: "org-1",
    hasOrgCudAccess: true,
    hasProjectCudAccess: false,
    projectRolesEntitlement: true,
    showFeaturePreviews: false,
    isUpdatingRole: false,
    onDelete: fn(),
    onUpdateOrgRole: fn(),
    onUpdateProjectRole: fn(),
    search: { value: "", onChange: fn() },
    toolbarActions: [
      { id: "add-member", label: "Add new member", onClick: fn() },
    ],
    pagination: {
      totalCount: null,
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
    },
    data: { status: "loading" },
  },
});
