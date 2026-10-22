import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { SectionSkills } from "./SectionSkills";

const meta = preview.meta({
  component: SectionSkills,
  args: { toolCallsByName: new Map() },
});

export const LoadRequested = meta.story({
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
        { skillName: "account-security" },
      ],
    },
    toolCallsByName: new Map([
      [
        "loadSkill",
        [
          {
            name: "loadSkill",
            invocationNumber: 1,
            arguments: { name: "refund-policy", version: 3 },
          },
        ],
      ],
      [
        "Read",
        [
          {
            name: "Read",
            invocationNumber: 2,
            arguments: { file_path: "/skills/account-security/SKILL.md" },
          },
        ],
      ],
      [
        "loadSkillResource",
        [
          {
            name: "loadSkillResource",
            invocationNumber: 3,
            arguments: { name: "refund-policy", path: "references/refunds.md" },
          },
          {
            name: "loadSkillResource",
            invocationNumber: 4,
            arguments: { name: "refund-policy", path: "references/refunds.md" },
          },
        ],
      ],
    ]),
  },
});

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

export const SingleLoaded = meta.story({
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
          skillName: "refund-policy",
          langfuseSkillId: "refund",
          skillVersion: 3,
          filePath: "SKILL.md",
        },
      ],
    },
  },
});

export const SingleAvailable = meta.story({
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
      ],
    },
  },
});

export const LongSkillAndFileNames = meta.story({
  args: {
    projectId: "storybook-project",
    skills: {
      kind: "loaded",
      items: [
        {
          skillName:
            "enterprise-customer-support-refund-policy-and-escalation-procedures",
          filePath:
            "references/international-shipping/customer-refund-and-escalation-procedures.md",
        },
      ],
    },
  },
});

export const SingleLoadedShowsFiles = meta.story({
  name: "(Test) Single Loaded Shows Files",
  args: SingleLoaded.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("references/refunds.md")).toBeVisible();
    await expect(canvas.getAllByText("SKILL.md")).toHaveLength(1);
    await expect(
      canvas.queryByRole("button", { name: "Files loaded for refund-policy" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "refund-policy" }),
    ).toHaveAttribute(
      "href",
      "/project/storybook-project/skills/refund-policy?version=3",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Loaded skill" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Loaded skill" }),
    );
    await expect(canvas.getByText("references/refunds.md")).toBeVisible();
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
      name: "Collapse Loaded skills",
    });

    await expect(summary).toHaveAttribute("aria-expanded", "true");
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

export const LongListStartsCollapsed = meta.story({
  name: "(Test) Long List Starts Collapsed",
  args: {
    ...Available.input.args,
    toolCallsByName: LoadRequested.input.args.toolCallsByName,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getByRole("button", { name: "Expand Skills" });
    await expect(within(summary).getByText("10")).toBeVisible();
    await expect(canvas.queryByRole("tab")).not.toBeInTheDocument();
    await userEvent.click(summary);
    await userEvent.click(
      canvas.getByRole("tab", { name: /^Not requested\s*8$/ }),
    );
    await expect(canvas.getByText("product-guide")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Skills" }),
    );
    await expect(within(summary).getByText("10")).toBeVisible();
  },
});

export const RequestedLoadsMatchAvailableRows = meta.story({
  name: "(Test) Requested Loads Match Available Rows",
  args: LoadRequested.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("tab", { name: /^Requested\s*2$/ }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      canvas.queryByRole("link", { name: "shipping-policy" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "refund-policy" }),
    ).toHaveAttribute(
      "href",
      "/project/storybook-project/skills/refund-policy?version=3",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Files requested for refund-policy" }),
    );
    await expect(canvas.getByText("SKILL.md")).toBeVisible();
    await expect(canvas.getAllByText("references/refunds.md")).toHaveLength(1);
    await expect(canvas.getByText("2 files")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Skills" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Skills" }),
    );
    await expect(canvas.getByText("references/refunds.md")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Files requested for account-security",
      }),
    );
    await expect(
      canvas.getByText("/skills/account-security/SKILL.md"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Files requested for refund-policy" }),
    ).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      canvas.getByRole("tab", { name: /^Not requested\s*1$/ }),
    );
    await expect(
      canvas.getByRole("link", { name: "shipping-policy" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "refund-policy" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /Files requested/ }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("tab", { name: /^Requested\s*2$/ }));
    await expect(
      canvas.getByRole("button", { name: "Files requested for refund-policy" }),
    ).toHaveAttribute("aria-expanded", "false");
  },
});

export const AllRequested = meta.story({
  name: "(Test) All Requested",
  args: {
    ...LoadRequested.input.args,
    skills: {
      kind: "available",
      items: [
        {
          skillName: "refund-policy",
          langfuseSkillId: "refund",
          skillVersion: 3,
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab")).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Files requested for refund-policy" }),
    );
    await expect(canvas.getByText("SKILL.md")).toBeVisible();
    await expect(canvas.getByText("references/refunds.md")).toBeVisible();
  },
});
