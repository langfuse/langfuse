import { definePreview } from "@storybook/nextjs-vite";
import addonA11y from "@storybook/addon-a11y";
import "../src/styles/globals.css";

export default definePreview({
  addons: [addonA11y()],
  parameters: {
    a11y: {
      test: "todo",
    },
  },
});
