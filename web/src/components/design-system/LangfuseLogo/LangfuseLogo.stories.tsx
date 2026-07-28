import preview from "../../../../.storybook/preview";
import { LangfuseLogo } from "./LangfuseLogo";

const meta = preview.meta({
  component: LangfuseLogo,
});

export const Default = meta.story({});

export const Customized = meta.story({
  args: {
    logoLightModeHref: "/wordart-black.svg",
    logoDarkModeHref: "/wordart-white.svg",
  },
});
