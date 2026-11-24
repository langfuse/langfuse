import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import {
  MembersSettingsTable,
  type MembersSettingsTableRow,
} from "./MembersSettingsTable";

const meta = preview.meta({ component: MembersSettingsTable });

const groupMemberNames = [
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
  "Katherine Johnson",
  "Linus Torvalds",
];

const memberPreview = (count: number) =>
  groupMemberNames.slice(0, count).map((name, index) => ({
    userId: `group-member-${index}`,
    name,
    email: `${name.split(" ")[0].toLowerCase()}@example.com`,
    image: null,
  }));

const members: MembersSettingsTableRow[] = [
  {
    user: { name: "Ada Lovelace", image: null },
    email: "ada@example.com",
    providers: ["google"],
    createdAt: new Date("2026-09-01"),
    orgRole: "ADMIN",
    groupRoles: [],
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
    groupRoles: [
      {
        groupId: "group-1",
        groupName: "platform-admins",
        groupSource: "SCIM",
        memberCount: 12,
        memberPreview: memberPreview(5),
        role: "ADMIN",
        level: "organization",
      },
    ],
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
    groupRoles: [],
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
    groupRoles: [],
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
    groupRoles: [],
    featurePreviews: null,
    featurePreviewManagement: null,
    meta: { userId: "user-5", orgMembershipId: "membership-5" },
  },
];

export const Default = meta.story({
  args: {
    orgId: "org-1",
    hasOrgCudAccess: true,
    canSeeOrgGroups: true,
    canManageOrgGroups: true,
    hasProjectCudAccess: false,
    canManageOrgOwnership: true,
    canManageProjectOwnership: true,
    isAiGatewayEnabled: true,
    isGroupsEnabled: true,
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

export const AdminViewingOwner = meta.story({
  name: "(Test) Admin cannot change an owner",
  args: {
    ...Default.input.args,
    canManageOrgOwnership: false,
    data: {
      status: "success",
      data: [
        {
          user: { name: "Barbara Liskov", image: null },
          email: "barbara@example.com",
          providers: ["email"],
          createdAt: new Date("2026-04-02"),
          orgRole: "OWNER",
          groupRoles: [],
          featurePreviews: null,
          featurePreviewManagement: null,
          meta: { userId: "user-6", orgMembershipId: "membership-6" },
        },
        ...members,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const openRoleDialogFor = async (name: RegExp) => {
      const row = within(canvas.getByRole("row", { name }));
      await userEvent.click(
        row.getByRole("button", { name: /Open role details/ }),
      );
      return within(await screen.findByRole("dialog"));
    };

    const owner = await openRoleDialogFor(/Barbara Liskov/);
    // The role picker is greyed out and says why on hover.
    const picker = owner.getByRole("combobox");
    await expect(picker).toBeDisabled();
    await userEvent.hover(picker.parentElement as HTMLElement);
    await waitFor(() =>
      expect(screen.getByText("Requires owner access")).toBeVisible(),
    );
    await expect(owner.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(owner.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const admin = await openRoleDialogFor(/Ada Lovelace/);
    await expect(admin.getByRole("combobox")).toBeEnabled();
  },
});

export const FilteredByRole = meta.story({
  args: {
    orgId: "org-1",
    hasOrgCudAccess: true,
    canSeeOrgGroups: true,
    canManageOrgGroups: true,
    hasProjectCudAccess: false,
    canManageOrgOwnership: true,
    canManageProjectOwnership: true,
    isAiGatewayEnabled: true,
    isGroupsEnabled: true,
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
    canSeeOrgGroups: true,
    canManageOrgGroups: true,
    hasProjectCudAccess: false,
    canManageOrgOwnership: true,
    canManageProjectOwnership: true,
    isAiGatewayEnabled: true,
    isGroupsEnabled: true,
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

const groupMember: MembersSettingsTableRow = {
  user: { name: "Vera Viewer", image: null },
  email: "vera@example.com",
  providers: ["okta"],
  createdAt: new Date("2026-10-01"),
  orgRole: "VIEWER",
  projectRole: "VIEWER",
  groupRoles: [
    {
      groupId: "group-admins",
      groupName: "langfuse-org-admins",
      groupSource: "SCIM",
      memberCount: 4,
      memberPreview: memberPreview(4),
      role: "ADMIN",
      level: "organization",
    },
    {
      groupId: "group-maintainers",
      groupName: "llm-app-maintainers",
      groupSource: "MANUAL",
      memberCount: 17,
      memberPreview: memberPreview(5),
      role: "MEMBER",
      level: "project",
    },
  ],
  featurePreviews: null,
  featurePreviewManagement: null,
  meta: { userId: "user-7", orgMembershipId: "membership-7" },
};

export const EffectiveRoleFromGroup = meta.story({
  name: "(Test) A group raises the effective role",
  args: {
    ...Default.input.args,
    data: { status: "success", data: [groupMember, ...members] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const vera = within(canvas.getByRole("row", { name: /Vera Viewer/ }));
    await expect(
      vera.getByRole("button", {
        name: "Admin, From langfuse-org-admins. Open role details",
      }),
    ).toBeInTheDocument();
  },
});

const ownRoleHigher: MembersSettingsTableRow = {
  user: { name: "Mary Jackson", image: null },
  email: "mary@example.com",
  providers: ["okta"],
  createdAt: new Date("2026-03-11"),
  orgRole: "ADMIN",
  groupRoles: [
    {
      groupId: "group-2",
      groupName: "data-science",
      groupSource: "SCIM",
      memberCount: 4,
      memberPreview: memberPreview(4),
      role: "MEMBER",
      level: "organization",
    },
  ],
  featurePreviews: null,
  featurePreviewManagement: null,
  meta: { userId: "user-8", orgMembershipId: "membership-8" },
};

export const GroupIconMarksGroupMembers = meta.story({
  name: "(Test) The group icon marks members who are in a group",
  args: {
    ...Default.input.args,
    data: { status: "success", data: [...members, ownRoleHigher] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const roleCell = (name: RegExp) =>
      within(canvas.getByRole("row", { name })).getByRole("button", {
        name: /Open role details/,
      });
    // The hover text names the group only for members who are in one.
    await expect(roleCell(/Mary Jackson/)).toHaveAttribute(
      "title",
      "Admin · Also in data-science",
    );
    await expect(roleCell(/Ada Lovelace/)).toHaveAttribute("title", "Admin");
  },
});

export const ProjectMembersWithGroups = meta.story({
  args: {
    ...Default.input.args,
    project: { id: "project-1", name: "LLM app" },
    hasProjectCudAccess: true,
    data: { status: "success", data: [groupMember, ...members] },
  },
});
