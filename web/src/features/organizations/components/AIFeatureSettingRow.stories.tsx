import { expect, fn, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { AIFeatureSettingRow } from "./AIFeatureSettingRow";

const meta = preview.meta({
  component: AIFeatureSettingRow,
});

export const Default = meta.story({
  args: {
    title: "Enable AI powered features for your organization",
    description: "This setting applies to all users and projects.",
    checked: true,
    onCheckedChange: fn(),
  },
});

export const Locked = meta.story({
  args: {
    title: "Enable AI powered features for your organization",
    description: "This setting applies to all users and projects.",
    checked: true,
    onCheckedChange: fn(),
    disabled: true,
    locked: true,
  },
});

export const LockedWithLongDescription = meta.story({
  args: {
    title: "Enable AI powered features for your organization",
    description:
      "This setting applies to all users and projects. Any data can be sent to AWS Bedrock within the Langfuse data region. Your data will not be used to train models. Applicable HIPAA, SOC2, GDPR, and ISO 27001 compliance remains intact.",
    checked: false,
    onCheckedChange: fn(),
    disabled: true,
    locked: true,
  },
});

export const LockBesideSwitch = meta.story({
  name: "(Test) Lock beside switch",
  args: {
    title: "AI Data Use for Product/Service Improvement",
    description: "Share data about your use of AI with Langfuse.",
    checked: true,
    onCheckedChange: fn(),
    disabled: true,
    locked: true,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const lockBox = canvas
      .getByTitle("No access")
      .getElementsByTagName("svg")[0]
      .getBoundingClientRect();
    const switchBox = canvas
      .getByRole("switch", { name: args.title })
      .getBoundingClientRect();

    await expect(lockBox.right).toBeLessThanOrEqual(switchBox.left);
  },
});
