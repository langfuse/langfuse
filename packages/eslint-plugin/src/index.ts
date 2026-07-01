import { default as noTailwindOverflowScroll } from "./rules/no-tailwind-overflow-scroll.js";
import { default as noInSourceVitest } from "./rules/no-in-source-vitest.js";
import { default as noMarginOnRootElements } from "./rules/no-margin-on-root-elements.js";
import { default as noOverlayZindex } from "./rules/no-overlay-zindex.js";
import { default as requireTitleWithTruncate } from "./rules/require-title-with-truncate.js";
import { default as noStyleProps } from "./rules/no-style-props.js";
import { default as noUnnecessaryCn } from "./rules/no-unnecessary-cn.js";

export const plugin = {
  rules: {
    "no-in-source-vitest": noInSourceVitest,
    "no-margin-on-root-elements": noMarginOnRootElements,
    "no-overlay-zindex": noOverlayZindex,
    "no-style-props": noStyleProps,
    "no-tailwind-overflow-scroll": noTailwindOverflowScroll,
    "no-unnecessary-cn": noUnnecessaryCn,
    "require-title-with-truncate": requireTitleWithTruncate,
  },
};

export default plugin;
