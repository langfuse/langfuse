import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import {
  MembersSettingsTable,
  type MembersSettingsTableRow,
} from "./MembersSettingsTable";

const meta = preview.meta({ component: MembersSettingsTable });

const members: MembersSettingsTableRow[] = [
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
];

export const Default = meta.story({
  args: {
    orgId: "org-1",
    hasOrgCudAccess: true,
    hasProjectCudAccess: false,
    projectRolesEntitlement: true,
    showFeaturePreviews: false,
    updatingOrgRoleMembershipIds: new Set(),
    updatingProjectRoleMembershipIds: new Set(),
    onDelete: fn(),
    onUpdateOrgRole: fn(),
    onUpdateProjectRole: fn(),
    search: { value: "", onChange: fn() },
    roleFilter: { value: [], onChange: fn() },
    toolbarActions: [
      { id: "add-member", label: "Add new member", onClick: fn() },
    ],
    pagination: {
      mode: "offset",
      totalCount: 5,
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
    },
    data: { status: "success", data: members },
  },
});

export const FilteredByRole = meta.story({
  args: {
    orgId: "org-1",
    hasOrgCudAccess: true,
    hasProjectCudAccess: false,
    projectRolesEntitlement: true,
    showFeaturePreviews: false,
    updatingOrgRoleMembershipIds: new Set(),
    updatingProjectRoleMembershipIds: new Set(),
    onDelete: fn(),
    onUpdateOrgRole: fn(),
    onUpdateProjectRole: fn(),
    search: { value: "", onChange: fn() },
    roleFilter: { value: ["OWNER", "ADMIN"], onChange: fn() },
    toolbarActions: [
      { id: "add-member", label: "Add new member", onClick: fn() },
    ],
    pagination: {
      mode: "offset",
      totalCount: 2,
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
    },
    data: {
      status: "success",
      data: members.filter((member) => member.orgRole === "ADMIN"),
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
    updatingOrgRoleMembershipIds: new Set(),
    updatingProjectRoleMembershipIds: new Set(),
    onDelete: fn(),
    onUpdateOrgRole: fn(),
    onUpdateProjectRole: fn(),
    search: { value: "", onChange: fn() },
    roleFilter: { value: [], onChange: fn() },
    toolbarActions: [
      { id: "add-member", label: "Add new member", onClick: fn() },
    ],
    pagination: {
      mode: "offset",
      totalCount: null,
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
    },
    data: { status: "loading" },
  },
});
