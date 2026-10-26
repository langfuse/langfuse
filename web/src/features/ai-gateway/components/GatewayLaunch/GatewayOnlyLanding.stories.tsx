import preview from "@/.storybook/preview";
import { GatewayOnlyLanding } from "./GatewayOnlyLanding";

const meta = preview.meta({ component: GatewayOnlyLanding });

export const Default = meta.story({
  args: {
    organizationId: "org-acme-robotics",
    organizationName: "Acme Robotics",
  },
});
