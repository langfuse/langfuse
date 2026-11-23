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
    href: "#",
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
    href: "#",
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
    href: "#",
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
    href: "#",
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
    href: "#",
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
    href: "#",
  },
});
