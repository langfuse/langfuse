import preview from "../../../../../../.storybook/preview";
import { SectionSkills } from "./SectionSkills";

const meta = preview.meta({ component: SectionSkills });

export const Available = meta.story({
  args: {
    projectId: "storybook-project",
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
        { skillName: "billing-support" },
        { skillName: "return-policy" },
        { skillName: "order-tracking" },
        { skillName: "customer-escalation" },
        { skillName: "tone-of-voice" },
        { skillName: "product-guide" },
      ],
    },
  },
});

export const Loaded = meta.story({
  args: {
    projectId: "storybook-project",
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
