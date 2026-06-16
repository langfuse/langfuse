import { definePreview } from "@storybook/nextjs-vite";
import addonA11y from "@storybook/addon-a11y";
import { createElement } from "react";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ThemeProvider } from "../src/features/theming/ThemeProvider";
import "../src/styles/globals.css";

export default definePreview({
  addons: [addonA11y()],
  globalTypes: {
    theme: {
      description: "Global theme for components",
      toolbar: {
        title: "Theme",
        icon: "sun",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === "dark" ? "dark" : "light";

      return createElement(
        ThemeProvider,
        {
          attribute: "class",
          disableTransitionOnChange: true,
          enableSystem: false,
          forcedTheme: theme,
        },
        createElement(
          TooltipProvider,
          null,
          createElement(
            "div",
            { className: "min-h-screen bg-background text-foreground" },
            createElement(Story),
          ),
        ),
      );
    },
  ],
  parameters: {
    a11y: {
      test: "todo",
    },
  },
});
