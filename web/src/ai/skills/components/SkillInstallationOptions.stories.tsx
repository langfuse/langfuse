import preview from "../../../../.storybook/preview";
import { SkillInstallationOptions } from "./SkillInstallationOptions";

const meta = preview.meta({ component: SkillInstallationOptions });

export const FromSkill = meta.story({
  args: {
    initialValues: {
      by: "name",
      name: "review-code",
      version: 7,
      label: "production",
      tag: "engineering",
    },
    names: ["review-code", "refund-policy"],
    labels: ["production", "staging"],
    tags: ["engineering", "research"],
  },
});

export const FromList = meta.story({
  args: {
    initialValues: {
      by: "tag",
      name: "review-code",
      version: null,
      label: "production",
      tag: "customer-support",
    },
    names: ["review-code", "refund-policy"],
    labels: ["production"],
    tags: ["customer-support", "engineering"],
  },
});

export const NoTags = meta.story({
  args: {
    initialValues: {
      by: "tag",
      name: "review-code",
      version: null,
      label: "production",
      tag: "my-tag",
    },
    names: ["review-code", "refund-policy"],
    labels: [],
    tags: [],
  },
});
