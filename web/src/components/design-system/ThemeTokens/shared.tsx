/**
 * Shared machinery for the Design reference pages (Color, Typography,
 * Layout, Charts). Everything token-shaped is parsed at build time from
 * `src/styles/globals.css` (see parseThemeTokens.ts), so the pages can never
 * drift from the stylesheet.
 *
 * Two things live here:
 * - The page chrome, re-exported from docsChrome.tsx (the langfuse.com/Kumo
 *   docs voice) under the neutral names the pages consume.
 * - The dense token-table machinery: one row per token with light and dark
 *   swatch+value side by side and a compact live usage sample. Samples
 *   repaint under the active Storybook theme (toolbar switcher).
 */
import { ChevronRight } from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";

import globalsCss from "../../../styles/globals.css?raw";
import {
  CropFrame as Panel,
  DocsPageHeader as PageHeader,
  DocsSection as PageSection,
  Eyebrow,
  SpecChip as InlineCode,
} from "./docsChrome";
import {
  parseThemeTokens,
  resolveDeclaredValue,
  toCssColor,
  type TokenDeclaration,
} from "./parseThemeTokens";

export const parsed = parseThemeTokens(globalsCss);

export type TokenEntry = {
  name: string;
  light?: TokenDeclaration;
  dark?: TokenDeclaration;
};

/** Every `:root`/`.dark` token, joined into light/dark pairs by name. */
export const rootEntries: TokenEntry[] = (() => {
  const byName = new Map<string, TokenEntry>();
  for (const declaration of parsed.light) {
    byName.set(declaration.name, {
      name: declaration.name,
      light: declaration,
    });
  }
  for (const declaration of parsed.dark) {
    const entry = byName.get(declaration.name);
    if (entry) entry.dark = declaration;
    else
      byName.set(declaration.name, {
        name: declaration.name,
        dark: declaration,
      });
  }
  return [...byName.values()];
})();

export type TokenContext = {
  dark: boolean;
  /** Declared value for the context's theme (dark falls back to :root). */
  decl: (name: string) => string | undefined;
  /** Fully var()-substituted declared value for the context's theme. */
  resolve: (value: string) => string;
  /** Paintable CSS color for a token in the context's theme. */
  color: (name: string) => string | undefined;
};

export function buildContext(dark: boolean): TokenContext {
  const map = new Map<string, string>();
  for (const declaration of [
    ...parsed.fontTokens,
    ...parsed.inlineTokens,
    ...parsed.light,
  ]) {
    map.set(declaration.name, declaration.value);
  }
  if (dark) {
    for (const declaration of parsed.dark)
      map.set(declaration.name, declaration.value);
  }
  const resolve = (value: string) => resolveDeclaredValue(value, map);
  return {
    dark,
    decl: (name) => map.get(name),
    resolve,
    color: (name) => toCssColor(resolve(`var(${name})`)),
  };
}

const subscribeToThemeClass = (callback: () => void) => {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
};

export const useIsDarkTheme = () =>
  useSyncExternalStore(
    subscribeToThemeClass,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

/** Active-theme context plus fixed light/dark contexts for the value cells. */
export function useTokenContexts() {
  const dark = useIsDarkTheme();
  return {
    ctx: buildContext(dark),
    lightCtx: buildContext(false),
    darkCtx: buildContext(true),
  };
}

/* ------------------------------------------------------------------------- *
 * Token completeness. Every token the parser extracts must appear on exactly
 * one page; anything unclaimed renders in Color's "Unassigned tokens" group
 * so nothing can silently vanish. First match wins; each matcher mirrors
 * what that page's sections actually render.
 * ------------------------------------------------------------------------- */

export type PageId = "color" | "typography" | "layout" | "charts";

const rootNames = new Set(rootEntries.map((entry) => entry.name));

export const PAGE_TOKEN_MATCHERS: Array<{
  page: PageId;
  test: (name: string) => boolean;
}> = [
  {
    // PRIVATE palette ramps ({family}-{mode}-{decade} steps in :root).
    // Claimed for Color's collapsed primitives section.
    page: "color",
    test: (n) => /^--(?:neutral|blue)-(?:light|dark)-\d+$/.test(n),
  },
  {
    page: "charts",
    test: (n) => /^--(?:chart-\d+|chart-grid|color-\d+)$/.test(n),
  },
  { page: "typography", test: (n) => /^--(?:font-|text-)/.test(n) },
  {
    page: "layout",
    test: (n) =>
      n === "--radius" || /^--(?:radius-|banner-|spacing-|animate-)/.test(n),
  },
  // Color is the default home: every remaining runtime (:root/.dark) token
  // plus the Tailwind color-utility mappings (including disabled built-ins).
  { page: "color", test: (n) => rootNames.has(n) || n.startsWith("--color-") },
];

/** Every distinct token name the parser extracted from globals.css. */
export const allTokenNames: string[] = [
  ...new Set(
    [
      ...parsed.fontTokens,
      ...parsed.inlineTokens,
      ...parsed.light,
      ...parsed.dark,
    ].map((t) => t.name),
  ),
];

export const pageForToken = (name: string): PageId | undefined =>
  PAGE_TOKEN_MATCHERS.find(({ test }) => test(name))?.page;

/** Tokens no page claims. Rendered on Color; ideally always empty. */
export const unassignedTokens: string[] = allTokenNames.filter(
  (name) => pageForToken(name) === undefined,
);

/** Look a token up across all parser collections, for generic rendering. */
export function findTokenDeclaration(name: string): {
  entry?: TokenEntry;
  staticDecl?: TokenDeclaration;
} {
  const entry = rootEntries.find((candidate) => candidate.name === name);
  if (entry) return { entry };
  const staticDecl = [...parsed.fontTokens, ...parsed.inlineTokens].find(
    (candidate) => candidate.name === name,
  );
  return staticDecl ? { staticDecl } : {};
}

/* ------------------------------------------------------------------------- *
 * Page chrome. The langfuse.com/Kumo docs voice from docsChrome.tsx (mono
 * uppercase eyebrows, hairline section dividers, quiet headers, spec chips,
 * crop-mark panels), re-exported under the names the pages consume.
 * ------------------------------------------------------------------------- */

export { Eyebrow, InlineCode, PageHeader, PageSection, Panel };

/* ------------------------------------------------------------------------- *
 * Dense token table.
 * ------------------------------------------------------------------------- */

export function Swatch({ color }: { color: string | undefined }) {
  if (!color) return null;
  return (
    <span
      aria-hidden
      className="border-border-contrast inline-block size-3 shrink-0 rounded-sm border align-middle"
      style={{ background: color }}
    />
  );
}

/**
 * Table row layout shared by the header row and every token row:
 * token · light · dark · sample.
 */
const ROW_GRID =
  "grid grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(200px,1.1fr)] items-center gap-x-4";

function TableHeader() {
  return (
    <div className={`${ROW_GRID} border-b pb-1.5`}>
      <Eyebrow>Token</Eyebrow>
      <Eyebrow>Light</Eyebrow>
      <Eyebrow>Dark</Eyebrow>
      <Eyebrow>Sample</Eyebrow>
    </div>
  );
}

export function EmptyCell() {
  return <span className="text-muted-foreground font-mono text-[11px]">—</span>;
}

/** One canonical (declared) value, with its theme-correct swatch. */
function ValueCell({
  decl,
  paint,
  emphasized,
}: {
  decl: TokenDeclaration | undefined;
  /** Context of the cell's own theme, so var() refs resolve correctly. */
  paint: TokenContext;
  /** The active toolbar theme's cell reads louder. */
  emphasized: boolean;
}) {
  if (!decl) return <EmptyCell />;
  const swatch = toCssColor(paint.resolve(decl.value));
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Swatch color={swatch} />
      <code
        className={`${
          emphasized ? "text-foreground" : "text-muted-foreground"
        } truncate font-mono text-[11px]`}
        title={decl.value}
      >
        {decl.value}
      </code>
    </div>
  );
}

export function TokenRow({
  name,
  entry,
  staticDecl,
  ctx,
  lightCtx,
  darkCtx,
  sample,
}: {
  name: string;
  /** Light/dark pair for :root/.dark tokens. */
  entry?: TokenEntry;
  /** Single declaration for @theme (static/inline) tokens. */
  staticDecl?: TokenDeclaration;
  ctx: TokenContext;
  lightCtx: TokenContext;
  darkCtx: TokenContext;
  sample: ReactNode;
}) {
  return (
    <div className={`${ROW_GRID} border-b py-1.5`}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <code className="text-foreground font-mono text-[11px] break-all">
          {name}
        </code>
      </div>
      {staticDecl ? (
        <div className="col-span-2 flex min-w-0 items-center gap-1.5">
          <Swatch color={toCssColor(ctx.resolve(staticDecl.value))} />
          <code
            className="text-foreground truncate font-mono text-[11px]"
            title={staticDecl.value}
          >
            {staticDecl.value}
          </code>
        </div>
      ) : (
        <>
          <ValueCell
            decl={entry?.light}
            paint={lightCtx}
            emphasized={!ctx.dark}
          />
          <ValueCell decl={entry?.dark} paint={darkCtx} emphasized={ctx.dark} />
        </>
      )}
      <div className="min-w-0 py-0.5">{sample ?? <EmptyCell />}</div>
    </div>
  );
}

/** A titled section holding one dense token table. */
export function TokenSection({
  title,
  blurb,
  count,
  sectionSample,
  children,
}: {
  title: string;
  blurb: string;
  count?: number;
  sectionSample?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageSection
      title={title}
      blurb={blurb}
      aside={
        count !== undefined ? (
          <InlineCode>
            {count} token{count === 1 ? "" : "s"}
          </InlineCode>
        ) : undefined
      }
    >
      {sectionSample && <div className="max-w-sm">{sectionSample}</div>}
      <div className="flex flex-col">
        <TableHeader />
        {children}
      </div>
    </PageSection>
  );
}

/** Low-traffic group: same table, but behind a native disclosure, collapsed. */
export function CollapsedSection({
  title,
  blurb,
  count,
  sectionSample,
  children,
}: {
  title: string;
  blurb: string;
  count?: number;
  sectionSample?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group border-t pt-6">
      <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="text-muted-foreground mt-1.5 size-4 shrink-0 transition-transform group-open:rotate-90"
        />
        <div className="flex flex-1 items-baseline justify-between gap-4">
          <div>
            <h2 className="text-foreground text-lg font-bold">{title}</h2>
            <p className="text-muted-foreground max-w-2xl text-sm">{blurb}</p>
          </div>
          {count !== undefined && (
            <InlineCode>
              {count} token{count === 1 ? "" : "s"}
            </InlineCode>
          )}
        </div>
      </summary>
      <div className="flex flex-col gap-3 pt-3 pl-6">
        {sectionSample && <div className="max-w-sm">{sectionSample}</div>}
        <div className="flex flex-col">
          <TableHeader />
          {children}
        </div>
      </div>
    </details>
  );
}
