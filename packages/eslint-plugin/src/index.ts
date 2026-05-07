import { default as noTailwindOverflowScroll } from "./rules/no-tailwind-overflow-scroll.js";

export const plugin = {
  rules: {
    "no-tailwind-overflow-scroll": noTailwindOverflowScroll,
  },
};

export default plugin;
