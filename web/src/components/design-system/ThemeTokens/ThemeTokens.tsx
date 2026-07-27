/**
 * Storybook-only theme token gallery. Renders every design token declared in
 * `src/styles/globals.css` — parsed from the stylesheet's raw text at build
 * time (see parseThemeTokens.ts), so it can never drift from the file.
 *
 * The gallery re-renders under the active Storybook theme (toolbar switcher):
 * swatches paint from the active theme's declared values, and each card also
 * shows the live `getComputedStyle` resolution. Tokens whose globals.css
 * declaration carries a `PROPOSED (review)` comment get a PROPOSED badge with
 * the parsed old → new value.
 */
import {
  type CSSProperties,
  type ReactNode,
  useSyncExternalStore,
} from "react";

import globalsCss from "../../../styles/globals.css?raw";
import {
  DocsPageHeader,
  DocsSection,
  ProposedBadge,
  SpecChip,
} from "./docsChrome";
import {
  parseThemeTokens,
  resolveDeclaredValue,
  toCssColor,
  type TokenDeclaration,
} from "./parseThemeTokens";

const parsed = parseThemeTokens(globalsCss);

type TokenEntry = {
  name: string;
  light?: TokenDeclaration;
  dark?: TokenDeclaration;
};

const rootEntries: TokenEntry[] = (() => {
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

type SectionId =
  | "surfaces"
  | "fills"
  | "borders"
  | "brand"
  | "controls"
  | "mutedAccents"
  | "status"
  | "qlang"
  | "sidebar"
  | "findMatch"
  | "charts"
  | "radius"
  | "layout"
  | "other";

/** First match wins; unmatched tokens land in "other" so new tokens always show up. */
const SECTION_MATCHERS: Array<{
  id: SectionId;
  test: (name: string) => boolean;
}> = [
  {
    id: "status",
    test: (n) =>
      /^--(?:accent-)?(?:light|dark)-(?:red|yellow|green|blue|violet|teal)$/.test(
        n,
      ),
  },
  {
    id: "mutedAccents",
    test: (n) => /^--muted-(?:magenta|blue|green|gray)$/.test(n),
  },
  { id: "qlang", test: (n) => n.startsWith("--qlang-") },
  { id: "sidebar", test: (n) => n.startsWith("--sidebar-") },
  { id: "findMatch", test: (n) => n.startsWith("--find-match-") },
  {
    id: "charts",
    test: (n) => /^--(?:chart-\d+|chart-grid|color-\d+)$/.test(n),
  },
  { id: "controls", test: (n) => n.startsWith("--control-") },
  {
    id: "brand",
    test: (n) => /^--(?:primary-accent|link|link-hover)$/.test(n),
  },
  {
    id: "borders",
    test: (n) => /^--(?:border|border-contrast|input|ring)$/.test(n),
  },
  {
    id: "fills",
    test: (n) =>
      /^--(?:primary|secondary|tertiary|accent|destructive)(?:-foreground)?$/.test(
        n,
      ),
  },
  {
    id: "surfaces",
    test: (n) =>
      /^--(?:background|foreground|foreground-tertiary|muted|surface-code(?:-header)?|popover|card|modal|header)(?:-foreground)?$/.test(
        n,
      ),
  },
  { id: "radius", test: (n) => n === "--radius" },
  { id: "layout", test: (n) => n.startsWith("--banner-") },
];

const SECTION_ORDER: Array<{ id: SectionId; title: string; blurb: string }> = [
  {
    id: "surfaces",
    title: "Surfaces & text tiers",
    blurb:
      "Canvas, elevation ladder and the paired text tiers that sit on them.",
  },
  {
    id: "fills",
    title: "Interactive fills",
    blurb: "Button / hover / selection fills with their paired foregrounds.",
  },
  {
    id: "borders",
    title: "Borders & focus",
    blurb: "Hairline, structure lines, input boundary and the focus ring.",
  },
  {
    id: "brand",
    title: "Brand & links",
    blurb: "Accent for tabs/selection plus the hyperlink pair.",
  },
  {
    id: "controls",
    title: "Selection controls",
    blurb: "Checkbox / switch fill, off-state track and unchecked boundary.",
  },
  {
    id: "status",
    title: "Status & accent pairs",
    blurb:
      "light-* tinted fills with dark-* readable text (chips, score levels).",
  },
  {
    id: "mutedAccents",
    title: "Muted accents",
    blurb: "Observation-type accents and the chart-grid grey.",
  },
  {
    id: "qlang",
    title: "Query syntax highlighting",
    blurb: "Search-bar grammar colors (field / value / number / keyword).",
  },
  {
    id: "sidebar",
    title: "Sidebar",
    blurb: "Side navigation chrome, nav-item states and its hairline.",
  },
  {
    id: "findMatch",
    title: "Find match",
    blurb: "In-page search highlight and the selected match.",
  },
  {
    id: "charts",
    title: "Charts",
    blurb: "Categorical chart series, grid lines and the score color scale.",
  },
  {
    id: "radius",
    title: "Radii",
    blurb: "Base radius and the derived sm / md / lg steps.",
  },
  {
    id: "layout",
    title: "Layout offsets",
    blurb: "Banner height system used by fixed/sticky positioning.",
  },
  {
    id: "other",
    title: "Other",
    blurb: "Tokens the gallery has no dedicated section for yet.",
  },
];

type GalleryContext = {
  dark: boolean;
  /** Declared value for the active theme (dark falls back to :root). */
  decl: (name: string) => string | undefined;
  /** Fully var()-substituted declared value for the active theme. */
  resolve: (value: string) => string;
  /** Paintable CSS color for a token in the active theme. */
  color: (name: string) => string | undefined;
  /** Live value from getComputedStyle (empty for @theme inline tokens). */
  computed: (name: string) => string;
};

function buildContext(dark: boolean): GalleryContext {
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
    computed: (name) =>
      typeof window === "undefined"
        ? ""
        : getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim(),
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

const useIsDarkTheme = () =>
  useSyncExternalStore(
    subscribeToThemeClass,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

function Swatch({ color }: { color: string | undefined }) {
  if (!color) return null;
  return (
    <span
      aria-hidden
      className="border-border-contrast inline-block size-3 shrink-0 rounded-sm border align-middle"
      style={{ background: color }}
    />
  );
}

function TokenCard({
  name,
  entry,
  staticDecl,
  ctx,
  sample,
}: {
  name: string;
  /** Light/dark pair for :root/.dark tokens. */
  entry?: TokenEntry;
  /** Single declaration for @theme (static/inline) tokens. */
  staticDecl?: TokenDeclaration;
  ctx: GalleryContext;
  sample: ReactNode;
}) {
  const themeDecl = ctx.dark ? entry?.dark : entry?.light;
  const otherThemeDecl = ctx.dark ? entry?.light : entry?.dark;
  const activeDecl = staticDecl ?? themeDecl ?? entry?.light;
  const inactiveDecl = staticDecl ? undefined : otherThemeDecl;
  const proposed = activeDecl?.proposed;
  const inactiveProposed = !proposed ? inactiveDecl?.proposed : undefined;
  const computed =
    staticDecl?.name.startsWith("--font") || entry ? ctx.computed(name) : "";
  const showResolved =
    computed.length > 0 &&
    activeDecl !== undefined &&
    computed !== activeDecl.value;
  const previousColor = proposed?.previousValue
    ? toCssColor(ctx.resolve(proposed.previousValue))
    : undefined;

  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <code className="text-foreground font-mono text-[11px] break-all">
          {name}
        </code>
        {proposed && <ProposedBadge />}
        {inactiveProposed && (
          <ProposedBadge mode={ctx.dark ? "light" : "dark"} />
        )}
      </div>
      {sample}
      <div className="text-muted-foreground flex flex-col gap-0.5 font-mono text-[11px] leading-4">
        {proposed && proposed.previousValue !== undefined && (
          <div
            className="flex flex-wrap items-center gap-1"
            title={proposed.note}
          >
            <Swatch color={previousColor} />
            <span className="line-through">{proposed.previousValue}</span>
            <span aria-hidden>→</span>
            <Swatch
              color={
                activeDecl
                  ? toCssColor(ctx.resolve(activeDecl.value))
                  : undefined
              }
            />
            <span className="text-foreground">{activeDecl?.value}</span>
          </div>
        )}
        {proposed &&
          proposed.previousValue === undefined &&
          proposed.note.length > 0 && (
            <div className="text-dark-yellow" title={proposed.note}>
              {proposed.note}
            </div>
          )}
        {staticDecl ? (
          !proposed && <div className="break-all">{staticDecl.value}</div>
        ) : (
          <>
            {entry?.light && (
              <div className={ctx.dark ? undefined : "text-foreground"}>
                light · {entry.light.value}
              </div>
            )}
            {entry?.dark && (
              <div className={ctx.dark ? "text-foreground" : undefined}>
                dark · {entry.dark.value}
              </div>
            )}
          </>
        )}
        {showResolved && <div>resolved · {computed}</div>}
      </div>
    </div>
  );
}

function SurfaceSample({
  background,
  color,
  border,
  children,
}: {
  background?: string;
  color?: string;
  border?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-md border px-3 py-2 text-sm"
      style={{
        background,
        color,
        ...(border ? { borderColor: border } : {}),
      }}
    >
      {children}
    </div>
  );
}

function QuerySample({ ctx }: { ctx: GalleryContext }) {
  return (
    <div
      className="rounded-md border px-3 py-2 font-mono text-xs"
      style={{ background: ctx.color("--background") }}
    >
      <span style={{ color: ctx.color("--qlang-field") }}>level</span>
      <span style={{ color: ctx.color("--muted-foreground") }}>:</span>
      <span style={{ color: ctx.color("--qlang-value") }}>error</span>{" "}
      <span style={{ color: ctx.color("--qlang-keyword") }}>AND</span>{" "}
      <span style={{ color: ctx.color("--qlang-field") }}>latency</span>
      <span style={{ color: ctx.color("--muted-foreground") }}>&gt;</span>
      <span style={{ color: ctx.color("--qlang-number") }}>2000</span>
    </div>
  );
}

function FindMatchSample({ ctx }: { ctx: GalleryContext }) {
  return (
    <div
      className="rounded-md border px-3 py-2 text-sm"
      style={{
        background: ctx.color("--background"),
        color: ctx.color("--foreground"),
      }}
    >
      the quick{" "}
      <mark
        style={{
          background: ctx.color("--find-match-background"),
          color: "inherit",
        }}
      >
        brown
      </mark>{" "}
      fox,{" "}
      <mark
        style={{
          background: ctx.color("--find-match-selected-background"),
          color: ctx.color("--find-match-selected-foreground"),
        }}
      >
        brown
      </mark>{" "}
      bear
    </div>
  );
}

function ChartBarSample({ ctx, name }: { ctx: GalleryContext; name: string }) {
  const index = Number(/\d+/.exec(name)?.[0] ?? 1);
  return (
    <div
      className="flex h-14 items-end gap-1 rounded-md border px-3 pt-2"
      style={{
        background: ctx.color("--background"),
        borderBottomColor: ctx.color("--chart-grid"),
      }}
    >
      {[0.9, 0.55, 0.75, 0.4].map((height, barIndex) => (
        <div
          key={barIndex}
          className="w-4 rounded-t-sm"
          style={{
            height: `${height * (0.6 + ((index * 7) % 5) / 10) * 100}%`,
            background: ctx.color(name),
            opacity: barIndex === 0 ? 1 : 0.75,
          }}
        />
      ))}
    </div>
  );
}

function GridLinesSample({ ctx }: { ctx: GalleryContext }) {
  return (
    <div
      className="flex h-14 flex-col justify-between rounded-md border px-3 py-2"
      style={{ background: ctx.color("--card") }}
    >
      {[0, 1, 2].map((line) => (
        <div
          key={line}
          style={{ borderTop: `1px solid ${ctx.color("--chart-grid")}` }}
        />
      ))}
    </div>
  );
}

function renderSample(
  sectionId: SectionId,
  name: string,
  ctx: GalleryContext,
): ReactNode {
  const color = ctx.color;
  switch (sectionId) {
    case "surfaces": {
      const isText = name.includes("foreground");
      if (isText) {
        let base = name.replace(/-foreground$/, "");
        if (name === "--foreground" || name === "--foreground-tertiary")
          base = "--background";
        if (name === "--muted-foreground") base = "--muted";
        return (
          <SurfaceSample background={color(base)} color={color(name)}>
            Aa — The quick brown fox
          </SurfaceSample>
        );
      }
      const pairedText = ctx.decl(`${name}-foreground`)
        ? `${name}-foreground`
        : "--foreground";
      return (
        <SurfaceSample background={color(name)} color={color(pairedText)}>
          Aa — text on {name.slice(2)}
        </SurfaceSample>
      );
    }
    case "fills": {
      const base = name.replace(/-foreground$/, "");
      const fg = ctx.decl(`${base}-foreground`)
        ? `${base}-foreground`
        : "--foreground";
      return (
        <div
          className="rounded-md border px-3 py-2"
          style={{ background: color("--background") }}
        >
          <span
            className="inline-block rounded-md px-3 py-1 text-sm"
            style={{ background: color(base), color: color(fg) }}
          >
            Button
          </span>
        </div>
      );
    }
    case "borders": {
      if (name === "--ring") {
        return (
          <div
            className="rounded-md border px-3 py-2"
            style={{ background: color("--background") }}
          >
            <span
              className="inline-block rounded-md border px-3 py-1 text-sm"
              style={{
                background: color("--card"),
                color: color("--foreground"),
                boxShadow: `0 0 0 2px ${color(name)}`,
              }}
            >
              Focused
            </span>
          </div>
        );
      }
      return (
        <SurfaceSample
          background={color("--card")}
          color={color("--foreground")}
          border={color(name)}
        >
          Aa — {name.slice(2)} edge
        </SurfaceSample>
      );
    }
    case "brand": {
      if (name === "--primary-accent") {
        return (
          <div
            className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            style={{
              background: color("--background"),
              color: color("--foreground"),
            }}
          >
            <span
              style={{
                color: color(name),
                boxShadow: `inset 0 -2px 0 ${color(name)}`,
              }}
              className="pb-0.5 font-bold"
            >
              Active tab
            </span>
            <span style={{ color: color("--muted-foreground") }}>
              Other tab
            </span>
          </div>
        );
      }
      return (
        <div
          className="rounded-md border px-3 py-2 text-sm"
          style={{ background: color("--background") }}
        >
          <span className="underline" style={{ color: color(name) }}>
            {name === "--link-hover" ? "A hovered hyperlink" : "A hyperlink"}
          </span>
        </div>
      );
    }
    case "controls": {
      return (
        <div
          className="flex items-center gap-4 rounded-md border px-3 py-2"
          style={{ background: color("--background") }}
        >
          {/* checked checkbox */}
          <span
            className="flex size-4 items-center justify-center rounded-sm text-[10px] font-bold"
            style={{
              background: color("--control-fill"),
              color: color("--background"),
              outline:
                name === "--control-fill"
                  ? `2px solid ${color("--ring")}`
                  : undefined,
              outlineOffset: 2,
            }}
          >
            ✓
          </span>
          {/* unchecked checkbox */}
          <span
            className="size-4 rounded-sm border"
            style={{
              borderColor: color("--control-border"),
              outline:
                name === "--control-border"
                  ? `2px solid ${color("--ring")}`
                  : undefined,
              outlineOffset: 2,
            }}
          />
          {/* switch, off state */}
          <span
            className="flex h-4 w-8 items-center rounded-full px-0.5"
            style={{
              background: color("--control-track"),
              outline:
                name === "--control-track"
                  ? `2px solid ${color("--ring")}`
                  : undefined,
              outlineOffset: 2,
            }}
          >
            <span
              className="size-3 rounded-full border"
              style={{ background: color("--card") }}
            />
          </span>
        </div>
      );
    }
    case "mutedAccents": {
      return (
        <div
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          style={{ background: color("--card") }}
        >
          <span
            className="size-4 rounded-sm"
            style={{ background: color(name) }}
          />
          <span style={{ color: color(name) }} className="font-bold">
            Aa
          </span>
          <span
            style={{ color: color("--muted-foreground") }}
            className="text-xs"
          >
            span label
          </span>
        </div>
      );
    }
    case "status": {
      const match = /^--(accent-)?(?:light|dark)-(\w+)$/.exec(name);
      const prefix = match?.[1] ?? "";
      const hue = match?.[2] ?? "";
      const fill = `--${prefix}light-${hue}`;
      const text = `--${prefix}dark-${hue}`;
      return (
        <div
          className="rounded-md border px-3 py-2"
          style={{ background: color("--background") }}
        >
          <span
            className="inline-block rounded-sm px-2 py-0.5 text-xs font-bold"
            style={{ background: color(fill), color: color(text) }}
          >
            {prefix ? `accent ${hue}` : hue} · 0.87
          </span>
        </div>
      );
    }
    case "qlang":
      return <QuerySample ctx={ctx} />;
    case "sidebar": {
      if (name === "--sidebar-ring") {
        return (
          <div
            className="rounded-md border px-3 py-2"
            style={{ background: color("--sidebar-background") }}
          >
            <span
              className="inline-block rounded-md px-2 py-1 text-sm"
              style={{
                color: color("--sidebar-foreground"),
                boxShadow: `0 0 0 2px ${color(name)}`,
              }}
            >
              Focused item
            </span>
          </div>
        );
      }
      if (name === "--sidebar-border") {
        return (
          <SurfaceSample
            background={color("--sidebar-background")}
            color={color("--sidebar-foreground")}
            border={color(name)}
          >
            Aa — sidebar hairline
          </SurfaceSample>
        );
      }
      const usesPrimary = name.startsWith("--sidebar-primary");
      const usesAccent = name.startsWith("--sidebar-accent");
      let itemStyle: CSSProperties = { color: color("--sidebar-foreground") };
      let itemLabel = "Nav item";
      if (usesPrimary) {
        itemStyle = {
          background: color("--sidebar-primary"),
          color: color("--sidebar-primary-foreground"),
        };
        itemLabel = "Primary item";
      } else if (usesAccent) {
        itemStyle = {
          background: color("--sidebar-accent"),
          color: color("--sidebar-accent-foreground"),
        };
        itemLabel = "Hovered item";
      }
      return (
        <div
          className="flex flex-col gap-1 rounded-md border p-2 text-sm"
          style={{
            background: color("--sidebar-background"),
            borderColor: color("--sidebar-border"),
          }}
        >
          <span className="rounded-md px-2 py-1" style={itemStyle}>
            {itemLabel}
          </span>
          <span
            className="px-2 py-1"
            style={{ color: color("--sidebar-foreground") }}
          >
            Another item
          </span>
        </div>
      );
    }
    case "findMatch":
      return <FindMatchSample ctx={ctx} />;
    case "charts": {
      if (name === "--chart-grid") return <GridLinesSample ctx={ctx} />;
      if (name.startsWith("--chart-"))
        return <ChartBarSample ctx={ctx} name={name} />;
      return (
        <div
          className="rounded-md border px-3 py-2"
          style={{ background: color("--background") }}
        >
          <span
            className="inline-block h-6 w-16 rounded-sm"
            style={{ background: color(name) }}
          />
        </div>
      );
    }
    case "radius": {
      const radius = ctx.decl(name);
      return (
        <div
          className="rounded-md border px-3 py-2"
          style={{ background: color("--background") }}
        >
          <div
            className="h-10 w-20 border"
            style={{
              background: color("--muted"),
              borderColor: color("--border-contrast"),
              borderRadius: radius,
            }}
          />
        </div>
      );
    }
    case "layout":
    case "other":
    default: {
      const swatchColor = color(name);
      return (
        <div
          className="rounded-md border px-3 py-2 font-mono text-xs"
          style={{
            background: color("--background"),
            color: color("--foreground"),
          }}
        >
          {swatchColor ? (
            <span
              className="inline-block h-6 w-16 rounded-sm"
              style={{ background: swatchColor }}
            />
          ) : (
            ctx.resolve(ctx.decl(name) ?? "") || "—"
          )}
        </div>
      );
    }
  }
}

function TypographySection({ ctx }: { ctx: GalleryContext }) {
  const fontStacks = parsed.fontTokens.filter((t) =>
    /^--font-(sans|mono|serif)/.test(t.name),
  );
  const weightRoles = parsed.fontTokens.filter((t) =>
    t.name.startsWith("--font-weight-"),
  );
  const textSizes = parsed.inlineTokens.filter((t) =>
    /^--text-[\w]+$/.test(t.name),
  );
  const weightFor = (sizeName: string) =>
    parsed.inlineTokens.find((t) => t.name === `${sizeName}--font-weight`);

  return (
    <GallerySection
      title="Typography"
      blurb="Font stacks, the two weight roles, and the text-* size tokens (each size carries its canonical weight). Full specimens: Design → Theme Tokens → Typography."
      count={fontStacks.length + weightRoles.length + textSizes.length}
    >
      {fontStacks.map((token) => (
        <TokenCard
          key={token.name}
          name={token.name}
          staticDecl={token}
          ctx={ctx}
          sample={
            <div
              className="flex flex-col gap-1 rounded-md border px-3 py-2"
              style={{
                background: ctx.color("--background"),
                color: ctx.color("--foreground"),
                fontFamily: token.value,
              }}
            >
              <span className="text-sm">
                The quick brown fox jumps over the lazy dog
              </span>
              <span className="text-sm">
                0123456789 · =&gt; !== {"{}"} [] 0O 1lI
              </span>
            </div>
          }
        />
      ))}
      {weightRoles.map((token) => (
        <TokenCard
          key={token.name}
          name={token.name}
          staticDecl={token}
          ctx={ctx}
          sample={
            <div
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                background: ctx.color("--background"),
                color: ctx.color("--foreground"),
                fontWeight: Number(ctx.resolve(token.value)) || undefined,
              }}
            >
              Weight role — The quick brown fox
            </div>
          }
        />
      ))}
      {textSizes.map((token) => {
        const weightToken = weightFor(token.name);
        return (
          <TokenCard
            key={token.name}
            name={token.name}
            staticDecl={token}
            ctx={ctx}
            sample={
              <div
                className="rounded-md border px-3 py-2"
                style={{
                  background: ctx.color("--background"),
                  color: ctx.color("--foreground"),
                  fontSize: token.value,
                  fontWeight: weightToken
                    ? Number(ctx.resolve(weightToken.value)) || undefined
                    : undefined,
                }}
              >
                Aa — {token.name.replace("--text-", "text-")} · {token.value}
                {weightToken ? ` · ${weightToken.value}` : ""}
              </div>
            }
          />
        );
      })}
    </GallerySection>
  );
}

function MappingsSection({ ctx }: { ctx: GalleryContext }) {
  const consumedElsewhere = (name: string) =>
    /^--text-/.test(name) || /^--radius-/.test(name) || /^--font-/.test(name);
  const colorMappings = parsed.inlineTokens.filter(
    (t) => t.name.startsWith("--color-") && t.value !== "initial",
  );
  const disabled = parsed.inlineTokens.filter((t) => t.value === "initial");
  const animations = parsed.inlineTokens.filter((t) =>
    t.name.startsWith("--animate-"),
  );
  const spacing = parsed.inlineTokens.filter((t) =>
    t.name.startsWith("--spacing-"),
  );
  const inlineRadii = parsed.inlineTokens.filter((t) =>
    /^--radius-/.test(t.name),
  );
  const known = new Set(
    [
      ...colorMappings,
      ...disabled,
      ...animations,
      ...spacing,
      ...inlineRadii,
    ].map((t) => t.name),
  );
  const leftovers = parsed.inlineTokens.filter(
    (t) => !known.has(t.name) && !consumedElsewhere(t.name),
  );

  const row = (token: TokenDeclaration) => (
    <div
      key={token.name}
      className="border-border flex items-center gap-2 border-b py-1 font-mono text-[11px] leading-4"
    >
      <Swatch color={toCssColor(ctx.resolve(token.value))} />
      <code className="text-foreground shrink-0">{token.name}</code>
      <span className="text-muted-foreground truncate" title={token.value}>
        {token.value}
      </span>
      {token.proposed && <ProposedBadge />}
    </div>
  );

  return (
    <GallerySection
      title="Tailwind mappings & animations"
      blurb="@theme inline: utility → token wiring, animation tokens, and the disabled built-in palettes. These emit utilities, not runtime vars."
      count={
        colorMappings.length +
        spacing.length +
        animations.length +
        leftovers.length
      }
    >
      <div className="col-span-full flex flex-col gap-6">
        <div className="columns-1 gap-8 md:columns-2 xl:columns-3">
          {[...colorMappings, ...spacing, ...animations, ...leftovers].map(row)}
        </div>
        {disabled.length > 0 && (
          <p className="text-muted-foreground font-mono text-[11px]">
            Disabled built-in palettes:{" "}
            {disabled
              .map((token) =>
                token.name.replace("--color-", "").replace("-*", ""),
              )
              .join(", ")}
          </p>
        )}
      </div>
    </GallerySection>
  );
}

function GallerySection({
  title,
  blurb,
  count,
  children,
}: {
  title: string;
  blurb: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <DocsSection
      title={title}
      blurb={blurb}
      aside={
        count !== undefined ? (
          <SpecChip>
            {count} token{count === 1 ? "" : "s"}
          </SpecChip>
        ) : undefined
      }
    >
      <div
        className="grid gap-3"
        style={
          {
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
          } as CSSProperties
        }
      >
        {children}
      </div>
    </DocsSection>
  );
}

export function ThemeTokens() {
  const dark = useIsDarkTheme();
  const ctx = buildContext(dark);

  const sectionEntries = new Map<SectionId, TokenEntry[]>();
  for (const entry of rootEntries) {
    const section =
      SECTION_MATCHERS.find((matcher) => matcher.test(entry.name))?.id ??
      "other";
    const bucket = sectionEntries.get(section) ?? [];
    bucket.push(entry);
    sectionEntries.set(section, bucket);
  }
  // Fold the derived radius steps from @theme inline into the Radii section.
  const inlineRadii = parsed.inlineTokens.filter((t) =>
    /^--radius-/.test(t.name),
  );

  const proposedLight = parsed.light.filter((t) => t.proposed).length;
  const proposedDark = parsed.dark.filter((t) => t.proposed).length;
  const proposedStatic = parsed.fontTokens.filter((t) => t.proposed).length;

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
        <DocsPageHeader
          eyebrow="Design tokens"
          title="Theme tokens"
          lede={
            <>
              Parsed at build time from{" "}
              <code className="font-mono">src/styles/globals.css</code> — the
              gallery cannot drift from the file. Use the toolbar theme switcher
              to re-render under light/dark; values marked <ProposedBadge />{" "}
              carry a <code className="font-mono">PROPOSED (review)</code>{" "}
              comment in the stylesheet, showing old → new.
            </>
          }
          meta={
            <>
              {rootEntries.length} themed tokens · {proposedLight} proposed in
              light · {proposedDark} proposed in dark
              {proposedStatic > 0
                ? ` · ${proposedStatic} proposed font tokens`
                : ""}
            </>
          }
        />
        {SECTION_ORDER.map(({ id, title, blurb }) => {
          const entries = sectionEntries.get(id) ?? [];
          const extraCards =
            id === "radius"
              ? inlineRadii.map((token) => (
                  <TokenCard
                    key={token.name}
                    name={token.name}
                    staticDecl={token}
                    ctx={ctx}
                    sample={
                      <div
                        className="rounded-md border px-3 py-2"
                        style={{ background: ctx.color("--background") }}
                      >
                        <div
                          className="h-10 w-20 border"
                          style={{
                            background: ctx.color("--muted"),
                            borderColor: ctx.color("--border-contrast"),
                            borderRadius: ctx.resolve(token.value),
                          }}
                        />
                      </div>
                    }
                  />
                ))
              : null;
          if (entries.length === 0 && !extraCards?.length) return null;
          return (
            <GallerySection
              key={id}
              title={title}
              blurb={blurb}
              count={entries.length + (extraCards?.length ?? 0)}
            >
              {entries.map((entry) => (
                <TokenCard
                  key={entry.name}
                  name={entry.name}
                  entry={entry}
                  ctx={ctx}
                  sample={renderSample(id, entry.name, ctx)}
                />
              ))}
              {extraCards}
            </GallerySection>
          );
        })}
        <TypographySection ctx={ctx} />
        <MappingsSection ctx={ctx} />
      </div>
    </div>
  );
}
