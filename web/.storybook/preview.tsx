import { definePreview } from "@storybook/nextjs-vite";
import addonA11y from "@storybook/addon-a11y";
import { useEffect, type ReactNode } from "react";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { LAYER_ORDER } from "../src/components/ui/layer";
import "../src/styles/globals.css";
// Mirror the global CSS that _app.tsx imports so vendored components
// (react18-json-view, streamdown markdown) render identically to the app.
import "react18-json-view/src/style.css";
import "streamdown/styles.css";

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

  // Reproduce the app's DOM scaffold so the layout rules in globals.css that are
  // scoped to `div#__next` / `div#__next > div` (height: 100%) and
  // `div#__next { isolation: isolate }` actually apply — the app's tables live
  // inside `#__next > div`, and without this scaffold Storybook only loosely
  // approximated the height/isolation/stacking context (see _document.tsx +
  // _app.tsx). `#__next` is given a real viewport height so the `height: 100%`
  // chain has something to resolve against.
  return (
    <>
      <div
        id="__next"
        className="bg-background text-foreground"
        style={{ height: "100vh" }}
      >
        <div>{children}</div>
      </div>
      {/* Overlay layer containers, declared exactly like _document.tsx: a
          <div data-overlay-root> sibling AFTER #__next (so it paints on top by
          DOM order), holding one <div data-layer={name}/> per LAYER_ORDER. This
          is what the layer system (components/ui/layer.tsx) portals toasts /
          tooltips / peek into; without it those overlays are absent in
          Storybook. Positioning/isolation comes from globals.css. */}
      <div data-overlay-root>
        {LAYER_ORDER.map((name) => (
          <div key={name} data-layer={name} />
        ))}
      </div>
    </>
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
