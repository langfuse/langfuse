import { default as noTailwindOverflowScroll } from "./rules/no-tailwind-overflow-scroll.js";
import { default as noInSourceVitest } from "./rules/no-in-source-vitest.js";
import { default as noStyleProps } from "./rules/no-style-props.js";
import { default as noUnnecessaryCn } from "./rules/no-unnecessary-cn.js";

export const plugin = {
  rules: {
    "no-in-source-vitest": noInSourceVitest,
    "no-style-props": noStyleProps,
    "no-tailwind-overflow-scroll": noTailwindOverflowScroll,
    "no-unnecessary-cn": noUnnecessaryCn,
  },
};

export default plugin;
