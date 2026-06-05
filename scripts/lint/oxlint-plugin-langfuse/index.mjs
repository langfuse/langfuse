import noInSourceVitest from "./rules/no-in-source-vitest.mjs";
import noTailwindOverflowScroll from "./rules/no-tailwind-overflow-scroll.mjs";

const plugin = {
  meta: {
    name: "langfuse",
  },
  rules: {
    "no-in-source-vitest": noInSourceVitest,
    "no-tailwind-overflow-scroll": noTailwindOverflowScroll,
  },
};

export default plugin;
