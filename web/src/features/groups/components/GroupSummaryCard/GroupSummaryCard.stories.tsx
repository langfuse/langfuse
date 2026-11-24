import { expect, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { GroupSummaryCard } from "./GroupSummaryCard";

const meta = preview.meta({ component: GroupSummaryCard });

const names = [
  "Demo User",
  "Demo User 2",
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
];

const memberPreview = (count: number) =>
  names.slice(0, count).map((name, index) => ({
    userId: `member-${index}`,
    name,
    email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
    image: null,
  }));

export const Default = meta.story({
  args: {
    name: "Support",
    level: "organization",
    source: "SCIM",
    role: "VIEWER",
    memberCount: 8,
    memberPreview: memberPreview(5),
  },
});

export const CreatedInLangfuse = meta.story({
  args: {
    name: "platform-admins",
    level: "organization",
    source: "MANUAL",
    role: "ADMIN",
    memberCount: 1,
    memberPreview: memberPreview(1),
  },
});

export const ProjectLevel = meta.story({
  args: {
    name: "llm-app-maintainers",
    level: "project",
    source: "MANUAL",
    role: "MEMBER",
    memberCount: 17,
    memberPreview: memberPreview(5),
  },
});

export const AiGatewayAccess = meta.story({
  args: {
    name: "gateway-users",
    level: "organization",
    source: "SCIM",
    role: "AI_GATEWAY",
    memberCount: 3,
    memberPreview: memberPreview(3),
  },
});

export const WithLongNames = meta.story({
  args: {
    name: "customer-success-and-solutions-engineering-emea-north",
    level: "organization",
    source: "SCIM",
    role: "MEMBER",
    memberCount: 42,
    memberPreview: memberPreview(5).map((member, index) => ({
      ...member,
      name:
        index === 0
          ? "Maximiliane Alexandra von Hohenlohe-Schillingsfürst"
          : member.name,
    })),
  },
});

export const MembersWithoutNames = meta.story({
  args: {
    name: "invited-contractors",
    level: "organization",
    source: "MANUAL",
    role: "VIEWER",
    memberCount: 2,
    memberPreview: memberPreview(2).map((member) => ({
      ...member,
      name: null,
    })),
    membersHref: "/organization/org-1/settings/groups?group=group-1",
    canEditGroup: true,
  },
});

export const WithMembersLink = meta.story({
  args: {
    name: "Platform Engineering",
    level: "organization",
    source: "SCIM",
    role: "ADMIN",
    memberCount: 8,
    memberPreview: memberPreview(5),
    membersHref: "/organization/org-1/settings/groups?group=group-platform",
  },
});

export const TestMembersLinkReplacesCount = meta.story({
  name: "(Test) A members link replaces the hidden-member count",
  args: {
    name: "Platform Engineering",
    level: "organization",
    source: "SCIM",
    role: "ADMIN",
    memberCount: 8,
    memberPreview: memberPreview(5),
    membersHref: "/organization/org-1/settings/groups?group=group-platform",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "View all 8 members" }),
    ).toHaveAttribute(
      "href",
      "/organization/org-1/settings/groups?group=group-platform",
    );
    await expect(canvas.queryByText("+3 more members")).toBeNull();
    await expect(canvas.getByText("Access in this organization")).toBeVisible();
    await expect(
      canvas.getByText("Members managed in your identity provider"),
    ).toBeVisible();
  },
});

export const TestCountWithoutMembersLink = meta.story({
  name: "(Test) Without a members link the hidden members are counted",
  args: {
    name: "Support",
    level: "project",
    source: "MANUAL",
    role: "VIEWER",
    memberCount: 8,
    memberPreview: memberPreview(5),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("+3 more members")).toBeVisible();
    await expect(canvas.queryByRole("link")).toBeNull();
    await expect(canvas.getByText("Access on this project")).toBeVisible();
  },
});
