import preview from "@/.storybook/preview";
import { GatewayReadyCard } from "./GatewayReadyCard";

const meta = preview.meta({ component: GatewayReadyCard });

export const Default = meta.story({
  args: {
    organizationId: "org-acme-robotics",
    activityLabel: "Last trace 4 min ago",
  },
});

export const NoTraces = meta.story({
  args: {
    organizationId: "org-acme-robotics",
    activityLabel: "No traces in the last 30d",
  },
});

export const Loading = meta.story({
  args: {
    organizationId: "org-acme-robotics",
    activityLabel: null,
  },
});
