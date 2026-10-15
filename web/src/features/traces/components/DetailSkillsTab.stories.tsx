import preview from "../../../../.storybook/preview";
import { DetailSkillsTab } from "./DetailSkillsTab";

const meta = preview.meta({ component: DetailSkillsTab });

export const Available = meta.story({
  args: {
    projectId: "storybook-project",
    isLoading: false,
    skills: {
      kind: "available",
      items: [
        {
          skillName: "refund-policy",
          langfuseSkillId: "refund",
          skillVersion: 3,
        },
        {
          skillName: "shipping-policy",
          langfuseSkillId: "shipping",
          skillVersion: 1,
        },
        {
          skillName: "subscription-support",
          langfuseSkillId: "subscription",
          skillVersion: 2,
        },
        { skillName: "account-security" },
      ],
    },
  },
});

export const Loaded = meta.story({
  args: {
    projectId: "storybook-project",
    isLoading: false,
    skills: {
      kind: "loaded",
      items: [
        {
          skillName: "refund-policy",
          langfuseSkillId: "refund",
          skillVersion: 3,
          filePath: "SKILL.md",
        },
        {
          skillName: "refund-policy",
          langfuseSkillId: "refund",
          skillVersion: 3,
          filePath: "references/refunds.md",
        },
        {
          skillName: "shipping-policy",
          langfuseSkillId: "shipping",
          skillVersion: 1,
          filePath: "references/international-shipping.md",
        },
        { skillName: "local-customer-support", filePath: "SKILL.md" },
      ],
    },
  },
});

export const Empty = meta.story({
  args: {
    projectId: "storybook-project",
    isLoading: false,
    skills: { kind: "loaded", items: [] },
  },
});

export const Loading = meta.story({
  args: {
    projectId: "storybook-project",
    isLoading: true,
    skills: { kind: "available", items: [] },
  },
});
