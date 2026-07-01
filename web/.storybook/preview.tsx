import { definePreview } from "@storybook/nextjs-vite";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import { DocsContainer } from "@storybook/addon-docs/blocks";
import { themes } from "storybook/theming";
import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { MarkdownContextProvider } from "../src/features/theming/useMarkdownContext";
import { LAYER_ORDER } from "../src/components/ui/layer";
import "../src/styles/globals.css";
// Mirror the global CSS that _app.tsx imports so vendored components
// (react18-json-view, streamdown markdown) render identically to the app.
import "react18-json-view/src/style.css";
import "streamdown/styles.css";

function StorybookThemeProvider({
  children,
  theme,
  fullHeight,
}: {
  children?: ReactNode;
  theme: "light" | "dark";
  /**
   * Give `#__next` a real viewport height so the app's `height: 100%` chains
   * resolve (canvas/story view). In docs view this must be OFF, or every inline
   * story block stretches to 100vh and leaves a tall empty gap below its
   * content. (LFE-10549)
   */
  fullHeight: boolean;
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
        style={{ height: fullHeight ? "100vh" : "auto" }}
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

/**
 * Docs/guide pages render outside the story decorator, so they don't get our
 * theme — Storybook's own docs theme is light and makes prose unreadable in
 * dark mode (and the page stays white). This container switches Storybook's
 * docs theme to match the app's `.dark` class (which the story decorators
 * toggle on <html>), so every guide's prose, chrome, and example cards follow
 * the theme. It also bumps the base type — the default docs body is too small.
 * (LFE-10549)
 */
function ThemedDocsContainer({
  context,
  children,
}: {
  context: ComponentProps<typeof DocsContainer>["context"];
  children?: ReactNode;
}) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <DocsContainer context={context} theme={dark ? themes.dark : themes.light}>
      <style>{`
        .sbdocs-content { font-size: 16px; }
        .sbdocs-content p, .sbdocs-content li { font-size: 1.0625rem; line-height: 1.7; }
      `}</style>
      {children}
    </DocsContainer>
  );
}

export default definePreview({
  // addonDocs() registers the docs preview renderer (parameters.docs.renderer)
  // that MDX pages and autodocs need; the CSF-factory preview must compose it
  // explicitly (the main.ts addons entry only wires the manager/preset side).
  addons: [addonA11y(), addonDocs()],
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
        <StorybookThemeProvider
          theme={theme}
          fullHeight={context.viewMode !== "docs"}
        >
          {/* MarkdownContextProvider mirrors the app: pages render inside it so
              the JSON/IO viewers (CodeJsonViewer's JSONView calls
              useMarkdownContext) work identically to production. Without it,
              multi-line IOTableCell renders (rowHeight m/l) throw. */}
          <MarkdownContextProvider>
            <TooltipProvider>
              <Story />
            </TooltipProvider>
          </MarkdownContextProvider>
        </StorybookThemeProvider>
      );
    },
  ],
  parameters: {
    a11y: {
      test: "todo",
    },
    docs: {
      container: ThemedDocsContainer,
    },
  },
});
