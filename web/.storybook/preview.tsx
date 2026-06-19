import { definePreview } from "@storybook/nextjs-vite";
import addonA11y from "@storybook/addon-a11y";
import { useEffect, type ReactNode } from "react";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/styles/globals.css";

function StorybookThemeProvider({
  children,
  theme,
}: {
  children?: ReactNode;
  theme: "light" | "dark";
}) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");

    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [theme]);

  return (
    <div className="bg-background text-foreground min-h-screen">{children}</div>
  );
}

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

      return (
        <StorybookThemeProvider theme={theme}>
          <TooltipProvider>
            <Story />
          </TooltipProvider>
        </StorybookThemeProvider>
      );
    },
  ],
  parameters: {
    a11y: {
      test: "todo",
    },
  },
});
