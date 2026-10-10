import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { SkillCliSelector } from "./SkillCliSelector";

const meta = preview.meta({ component: SkillCliSelector });

export const Tags = meta.story({
  args: {
    label: "Skill tag",
    options: ["customer-support", "engineering", "research"].map((value) => ({
      value,
      label: value,
    })),
    value: "customer-support",
    onValueChange: fn(),
  },
});

export const Labels = meta.story({
  args: {
    label: "Version label",
    options: ["production", "latest"].map((value) => ({ value, label: value })),
    value: "production",
    onValueChange: fn(),
  },
});

export const LongTag = meta.story({
  args: {
    label: "Skill tag",
    options: [
      "customer-support-international-escalation-and-troubleshooting",
      "engineering",
    ].map((value) => ({ value, label: value })),
    value: "customer-support-international-escalation-and-troubleshooting",
    onValueChange: fn(),
  },
});
