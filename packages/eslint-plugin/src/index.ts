import { default as noTailwindOverflowScroll } from "./rules/no-tailwind-overflow-scroll.js";
import { default as noInSourceVitest } from "./rules/no-in-source-vitest.js";

export const plugin = {
  rules: {
    "no-in-source-vitest": noInSourceVitest,
    "no-tailwind-overflow-scroll": noTailwindOverflowScroll,
  },
};

export default plugin;
