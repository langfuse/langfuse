import { expect, userEvent, within } from "storybook/test";

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
  name: "(Test) Loaded",
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getByRole("button", {
      name: "3 loaded skills show",
    });

    await expect(summary).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(summary);
    const refundFiles = canvas.getByRole("button", {
      name: "Files loaded for refund-policy",
    });
    await userEvent.click(refundFiles);
    await expect(canvas.getByText("references/refunds.md")).toBeVisible();

    await userEvent.click(summary);
    await userEvent.click(summary);
    await expect(canvas.getByText("references/refunds.md")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Files loaded for shipping-policy" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Files loaded for refund-policy" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.getByText("references/international-shipping.md"),
    ).toBeVisible();
  },
});
