import { definePreview } from "@storybook/nextjs-vite";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import { DocsContainer } from "@storybook/addon-docs/blocks";
import { GLOBALS_UPDATED, SET_GLOBALS } from "storybook/internal/core-events";
import { addons } from "storybook/preview-api";
import { themes } from "storybook/theming";
import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { LayerProvider } from "../src/context/LayerContext/LayerContext";
import { ThemeProvider } from "../src/features/theming/ThemeProvider";
import "./storybook.css";
import "./docs.css";
// Mirror the global CSS that _app.tsx imports so vendored components
// (react18-json-view, streamdown markdown) render identically to the app.
import "react18-json-view/src/style.css";
import "streamdown/styles.css";

function StorybookThemeProvider({
  children,
  fullHeight,
  theme,
}: {
  children?: ReactNode;
  /**
   * Give `#__next` a real viewport height so the app's `height: 100%` chains
   * resolve (canvas/story view). In docs view this must be OFF, or every inline
   * story block stretches to 100vh and leaves a tall empty gap below its
   * content. (LFE-10549)
   */
  fullHeight: boolean;
  theme: "light" | "dark";
}) {
  // Reproduce the app's DOM scaffold so the layout rules in globals.css that are
  // scoped to `div#__next` / `div#__next > div` (height: 100%) and
  // `div#__next { isolation: isolate }` actually apply — the app's tables live
  // inside `#__next > div`, and without this scaffold Storybook only loosely
  // approximated the height/isolation/stacking context (see _document.tsx +
  // _app.tsx). `#__next` is given a real viewport height so the `height: 100%`
  // chain has something to resolve against.
  return (
    <ThemeProvider
      attribute="class"
      forcedTheme={theme}
      enableSystem={false}
      disableTransitionOnChange
    >
      <div
        id="__next"
        className="bg-background text-foreground"
        style={{ height: fullHeight ? "100vh" : "auto" }}
      >
        <div>{children}</div>
      </div>
    </ThemeProvider>
  );
}

const syncTheme = ({ globals }: { globals?: { theme?: unknown } }) => {
  document.documentElement.classList.toggle("dark", globals?.theme === "dark");
};

const channel = addons.getChannel();
channel.on(SET_GLOBALS, syncTheme);
channel.on(GLOBALS_UPDATED, syncTheme);

/**
 * Docs/guide pages render outside the story decorator, so they don't get our
 * theme — Storybook's own docs theme is light and makes prose unreadable in
 * dark mode (and the page stays white). This container switches Storybook's
 * docs theme to match the app's `.dark` class (which the global theme listener
 * toggles on <html>), so every guide's prose, chrome, and example cards follow
 * the theme. (LFE-10549)
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
    <LayerProvider>
      <DocsContainer
        context={context}
        theme={dark ? themes.dark : themes.light}
      >
        {children}
      </DocsContainer>
    </LayerProvider>
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
      const story = (
        <StorybookThemeProvider
          fullHeight={context.viewMode !== "docs"}
          theme={context.globals.theme === "dark" ? "dark" : "light"}
        >
          {/* SessionProvider mirrors _app.tsx: components reading feature
              flags call useSession, which throws without a provider. A null
              session resolves every flag to false (regular-user behavior). */}
          <SessionProvider session={null}>
            <TooltipProvider>
              <Story />
            </TooltipProvider>
          </SessionProvider>
        </StorybookThemeProvider>
      );

      return context.viewMode === "docs" ? (
        story
      ) : (
        <LayerProvider>{story}</LayerProvider>
      );
    },
  ],
  parameters: {
    a11y: {
      test: "todo",
      config: {
        rules: [{ id: "color-contrast", enabled: false }],
      },
    },
    docs: {
      container: ThemedDocsContainer,
    },
    options: {
      storySort: (a, b) => {
        const sectionOrder = ["Design", "Playground"];
        const designDocOrder = [
          "Design/Overview",
          "Design/Writing Good Stories",
        ];
        const aSectionIndex = sectionOrder.indexOf(a.title.split("/")[0] ?? "");
        const bSectionIndex = sectionOrder.indexOf(b.title.split("/")[0] ?? "");
        const sectionDifference =
          (aSectionIndex === -1 ? sectionOrder.length : aSectionIndex) -
          (bSectionIndex === -1 ? sectionOrder.length : bSectionIndex);
        if (sectionDifference !== 0) return sectionDifference;

        const aDesignDocIndex = designDocOrder.indexOf(a.title);
        const bDesignDocIndex = designDocOrder.indexOf(b.title);
        if (aDesignDocIndex !== bDesignDocIndex) {
          if (aDesignDocIndex === -1) return 1;
          if (bDesignDocIndex === -1) return -1;
          return aDesignDocIndex - bDesignDocIndex;
        }

        // Returning 0 preserves Storybook's existing stable order. Only
        // partition test stories when both entries belong to the same component.
        if (a.title !== b.title) return 0;

        const aIsTest = a.name.startsWith("(Test)");
        const bIsTest = b.name.startsWith("(Test)");
        if (aIsTest !== bIsTest) return aIsTest ? 1 : -1;

        return 0;
      },
    },
  },
});
