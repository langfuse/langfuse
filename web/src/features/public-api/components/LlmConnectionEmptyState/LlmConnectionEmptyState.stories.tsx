import { Building2, Plug } from "lucide-react";

import preview from "@/.storybook/preview";
import { LlmConnectionEmptyState } from "./LlmConnectionEmptyState";

const meta = preview.meta({ component: LlmConnectionEmptyState });

export const Organization = meta.story({
  args: {
    icon: Building2,
    title: "No organization connections",
    description:
      "Organization connections are shared with every project in Seed Org.",
  },
});

export const Project = meta.story({
  args: {
    icon: Plug,
    title: "No project connections",
    description:
      "Project connections are only available in llm-app and take precedence over organization connections with the same provider.",
  },
});
