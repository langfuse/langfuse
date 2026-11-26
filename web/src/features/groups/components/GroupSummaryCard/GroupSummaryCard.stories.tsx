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
    groupHref: "/organization/org-1/settings/groups?group=group-support",
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
    groupHref: "/organization/org-1/settings/groups?group=group-admins",
  },
});

export const WithLongNames = meta.story({
  args: {
    name: "customer-success-and-solutions-engineering-emea-north",
    level: "project",
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

export const TestWithoutMemberPreview = meta.story({
  name: "(Test) Without the member preview only the count is shown",
  args: {
    ...Default.input.args,
    level: "project",
    memberPreview: [],
    groupHref: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/8 members/)).toBeVisible();
    await expect(canvas.queryByText(/more members/)).toBeNull();
    await expect(canvas.queryByRole("link")).toBeNull();
    await expect(canvas.getByText("Access on this project")).toBeVisible();
  },
});
