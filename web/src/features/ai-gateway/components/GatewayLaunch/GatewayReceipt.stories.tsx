import preview from "@/.storybook/preview";
import { GatewayReceipt } from "./GatewayReceipt";

const meta = preview.meta({ component: GatewayReceipt });

export const Banner = meta.story({
  args: { variant: "banner" },
});

export const Dialog = meta.story({
  args: { variant: "dialog" },
});
