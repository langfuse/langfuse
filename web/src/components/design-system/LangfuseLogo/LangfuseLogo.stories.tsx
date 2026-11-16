import preview from "../../../../.storybook/preview";
import { LangfuseLogo } from "./LangfuseLogo";

const meta = preview.meta({
  component: LangfuseLogo,
});

export const Default = meta.story({});

export const Customized = meta.story({
  args: {
    logoLightModeHref: "/langfuse-by-clickhouse.svg",
    logoDarkModeHref: "/langfuse-by-clickhouse-white.svg",
  },
});
