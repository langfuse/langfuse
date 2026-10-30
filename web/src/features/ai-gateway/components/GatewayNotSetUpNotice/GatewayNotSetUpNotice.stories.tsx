import preview from "@/.storybook/preview";
import { GatewayNotSetUpNotice } from "./GatewayNotSetUpNotice";

const meta = preview.meta({ component: GatewayNotSetUpNotice });

export const Default = meta.story({
  args: { title: "Models" },
});
