/**
 * Storybook-only color reference (Design → Color): every token family as a
 * Kumo-style hierarchy table — token chip · purpose one-liner · light and
 * dark swatch — plus the collapsed palette primitives and legacy aliases.
 *
 * Every value is parsed at build time from `src/styles/globals.css` (see
 * parseThemeTokens.ts), so the page cannot drift from the stylesheet.
 * Specimens repaint under the active Storybook theme (toolbar switcher).
 */
import { ChevronRight } from "lucide-react";
import { type ReactNode } from "react";

import {
  CollapsedSection,
  Eyebrow,
  findTokenDeclaration,
  InlineCode,
  PageHeader,
  pageForToken,
  PageSection,
  parsed,
  rootEntries,
  Swatch,
  type TokenContext,
  TokenRow,
  unassignedTokens,
  useTokenContexts,
} from "./shared";
import { toCssColor } from "./parseThemeTokens";

/** The private palette steps components must never reference. */
const PRIMITIVE_PATTERN = /^--(?:neutral|blue)-(?:light|dark)-\d+$/;

/* ------------------------------------------------------------------------- *
 * Hierarchy tables (the Kumo format). One row per token: utility chip,
 * purpose one-liner, light + dark swatch with the resolved value — all
 * derived from the parsed stylesheet, never hardcoded.
 * ------------------------------------------------------------------------- */

type HierarchyKind = "fill" | "line" | "text";

type HierarchyRow = {
  /** Utility name shown in the chip, e.g. `bg-canvas`, `text-link`. */
  utility: string;
  /** Backing custom property, e.g. `--bg-canvas`. */
  token: string;
  /** One line. No essays. */
  purpose: ReactNode;
  /** Per-row kind override (sections mixing fills, lines and text). */
  kind?: HierarchyKind;
  /** For text kind: token painted under the sample (defaults to canvas). */
  on?: string;
};

const SURFACE_HIERARCHY: HierarchyRow[] = [
  {
    utility: "bg-canvas",
    token: "--bg-canvas",
    purpose: "The outermost page background — sits behind everything",
  },
  {
    utility: "bg-sidebar",
    token: "--bg-sidebar",
    purpose: "The global nav frame, one step off the canvas",
  },
  {
    utility: "bg-card",
    token: "--bg-card",
    purpose: "Elevated surface — cards, widgets, panels",
  },
  {
    utility: "bg-modal",
    token: "--bg-modal",
    purpose: "Blocking dialogs — shares the card tier",
  },
  {
    utility: "bg-popover",
    token: "--bg-popover",
    purpose: "Menus, command palette, tooltips — top of the ladder",
  },
  {
    utility: "bg-muted",
    token: "--bg-muted",
    purpose: "Quiet fill — chips, skeletons, code blocks, tab lists",
  },
  {
    utility: "bg-hover",
    token: "--bg-hover",
    purpose: "Hovered rows, focused menu items, selected nav",
  },
];

const BORDER_HIERARCHY: HierarchyRow[] = [
  {
    utility: "border",
    token: "--border",
    purpose:
      "The default hairline — dividers, table rows, card edges, inputs, popover borders",
  },
  {
    utility: "border-border-contrast",
    token: "--border-contrast",
    purpose:
      "Assertive line — outline buttons, structural/viz lines, checkbox borders",
  },
  {
    utility: "ring-focus",
    token: "--focus",
    purpose:
      "The keyboard-focus ring — neutral, so blue always means link or selection",
  },
];

const TEXT_HIERARCHY: HierarchyRow[] = [
  {
    utility: "text-primary",
    token: "--text-primary",
    purpose: "Brightest tier — titles, emphasis, active nav & tabs",
  },
  {
    utility: "text-secondary",
    token: "--text-secondary",
    purpose: "Body — the inherited default copy",
  },
  {
    utility: "text-tertiary",
    token: "--text-tertiary",
    purpose: "Meta — captions, labels, secondary cells",
  },
  {
    utility: "text-disabled",
    token: "--text-disabled",
    purpose: "Faintest — placeholders, disabled, hints",
  },
  {
    utility: "text-on-fill",
    token: "--text-on-fill",
    purpose: "Inverted ink on bright fills — rides the canvas color",
    on: "--primary",
  },
  {
    utility: "text-on-hover",
    token: "--text-on-hover",
    purpose: "Ink on the hover fill — rides the brightest tier",
    on: "--bg-hover",
  },
  {
    utility: "text-link",
    token: "--link",
    purpose: "Hyperlinks — their own blue pair, distinct from primary-accent",
  },
  {
    utility: "text-link-hover",
    token: "--link-hover",
    purpose: "The link hover step",
  },
];

const BRAND_HIERARCHY: HierarchyRow[] = [
  {
    utility: "text-primary-accent",
    token: "--primary-accent",
    purpose: "Active tabs & selection underline — the brand blue",
    kind: "text",
  },
  {
    utility: "bg-primary",
    token: "--primary",
    purpose: "Primary button fill — rides the brightest ink tier",
    kind: "fill",
  },
  {
    utility: "bg-destructive",
    token: "--destructive",
    purpose:
      "Danger fill — destructive buttons (error text via text-destructive)",
    kind: "fill",
  },
  {
    utility: "text-destructive-foreground",
    token: "--destructive-foreground",
    purpose: "Ink on the danger fill",
    kind: "text",
    on: "--destructive",
  },
];

/** light-* tint fill + dark-* readable text, per hue. */
const STATUS_HIERARCHY: HierarchyRow[] = [
  {
    utility: "bg-light-red",
    token: "--light-red",
    purpose: "Error / negative status tint (alpha baked in)",
    kind: "fill",
  },
  {
    utility: "text-dark-red",
    token: "--dark-red",
    purpose: "Text/icon on the red tint",
    kind: "text",
    on: "--light-red",
  },
  {
    utility: "bg-light-yellow",
    token: "--light-yellow",
    purpose: "Warning tint — also experiment-level scores",
    kind: "fill",
  },
  {
    utility: "text-dark-yellow",
    token: "--dark-yellow",
    purpose: "Text/icon on the yellow tint",
    kind: "text",
    on: "--light-yellow",
  },
  {
    utility: "bg-light-green",
    token: "--light-green",
    purpose: "Success / positive tint",
    kind: "fill",
  },
  {
    utility: "text-dark-green",
    token: "--dark-green",
    purpose: "Text/icon on the green tint",
    kind: "text",
    on: "--light-green",
  },
  {
    utility: "bg-light-blue",
    token: "--light-blue",
    purpose: "Info tint — also observation-level scores",
    kind: "fill",
  },
  {
    utility: "text-dark-blue",
    token: "--dark-blue",
    purpose: "Text/icon on the blue tint",
    kind: "text",
    on: "--light-blue",
  },
  {
    utility: "bg-light-violet",
    token: "--light-violet",
    purpose: "Trace-level score tint",
    kind: "fill",
  },
  {
    utility: "text-dark-violet",
    token: "--dark-violet",
    purpose: "Text/icon on the violet tint",
    kind: "text",
    on: "--light-violet",
  },
  {
    utility: "bg-light-teal",
    token: "--light-teal",
    purpose: "Session-level score tint",
    kind: "fill",
  },
  {
    utility: "text-dark-teal",
    token: "--dark-teal",
    purpose: "Text/icon on the teal tint",
    kind: "text",
    on: "--light-teal",
  },
  {
    utility: "bg-accent-light-blue",
    token: "--accent-light-blue",
    purpose: "Deeper blue tint — dataset banners & import chips",
    kind: "fill",
  },
  {
    utility: "text-accent-dark-blue",
    token: "--accent-dark-blue",
    purpose: "Text/icon on the deep-blue tint",
    kind: "text",
    on: "--accent-light-blue",
  },
  {
    utility: "bg-accent-light-green",
    token: "--accent-light-green",
    purpose: "Diff/output surface tint — a whisper above card in dark",
    kind: "fill",
  },
  {
    utility: "text-accent-dark-green",
    token: "--accent-dark-green",
    purpose: "Text/icon on the deep-green tint",
    kind: "text",
    on: "--accent-light-green",
  },
];

const CONTROL_HIERARCHY: HierarchyRow[] = [
  {
    utility: "bg-control-fill",
    token: "--control-fill",
    purpose: "Checked checkbox / switch fill — monochrome in both modes",
    kind: "fill",
  },
  {
    utility: "bg-control-track",
    token: "--control-track",
    purpose: "The switch's off-state track",
    kind: "fill",
  },
  {
    utility: "border-control-border",
    token: "--control-border",
    purpose: "Unchecked control boundary",
    kind: "line",
  },
];

const SIDEBAR_HIERARCHY: HierarchyRow[] = [
  {
    utility: "text-sidebar-foreground",
    token: "--sidebar-foreground",
    purpose: "Resting nav ink — dimmer than content until active",
    kind: "text",
    on: "--bg-sidebar",
  },
  {
    utility: "bg-sidebar-accent",
    token: "--sidebar-accent",
    purpose: "Selected nav fill — bg-hover tier in dark, its own step in light",
    kind: "fill",
  },
  {
    utility: "text-sidebar-accent-foreground",
    token: "--sidebar-accent-foreground",
    purpose: "Ink on the selected item — the bright tier",
    kind: "text",
    on: "--sidebar-accent",
  },
  {
    utility: "bg-sidebar-primary",
    token: "--sidebar-primary",
    purpose: "Primary item fill — rides the bright ink tier",
    kind: "fill",
  },
  {
    utility: "text-sidebar-primary-foreground",
    token: "--sidebar-primary-foreground",
    purpose: "Ink on the primary fill",
    kind: "text",
    on: "--sidebar-primary",
  },
  {
    utility: "border-sidebar-border",
    token: "--sidebar-border",
    purpose: "Sidebar hairline — alias of --border",
    kind: "line",
  },
  {
    utility: "ring-sidebar-ring",
    token: "--sidebar-ring",
    purpose: "Focus ring in the sidebar — alias of --focus",
    kind: "line",
  },
];

const VIZ_HIERARCHY: HierarchyRow[] = [
  {
    utility: "bg-muted-blue",
    token: "--muted-blue",
    purpose: "Observation-type accent — trace tree, timelines (ItemBadge)",
    kind: "fill",
  },
  {
    utility: "bg-muted-green",
    token: "--muted-green",
    purpose: "Observation-type accent — trace tree, timelines",
    kind: "fill",
  },
  {
    utility: "bg-muted-magenta",
    token: "--muted-magenta",
    purpose: "Observation-type accent — trace tree, timelines",
    kind: "fill",
  },
  {
    utility: "bg-muted-gray",
    token: "--muted-gray",
    purpose:
      "Chart grid & disabled badge fill — rides the hover tier (chart-grid resolves here)",
    kind: "fill",
  },
];

const QLANG_HIERARCHY: HierarchyRow[] = [
  {
    utility: "text-qlang-field",
    token: "--qlang-field",
    purpose: "Field names — violet",
  },
  {
    utility: "text-qlang-value",
    token: "--qlang-value",
    purpose: "Values — green",
  },
  {
    utility: "text-qlang-number",
    token: "--qlang-number",
    purpose: "Numbers — orange",
  },
  {
    utility: "text-qlang-keyword",
    token: "--qlang-keyword",
    purpose: "AND / OR keywords — the app blue",
  },
];

const FIND_MATCH_HIERARCHY: HierarchyRow[] = [
  {
    utility: "bg-find-match-background",
    token: "--find-match-background",
    purpose: "Every in-page match",
    kind: "fill",
  },
  {
    utility: "bg-find-match-selected-background",
    token: "--find-match-selected-background",
    purpose: "The active match",
    kind: "fill",
  },
  {
    utility: "text-find-match-selected-foreground",
    token: "--find-match-selected-foreground",
    purpose: "Ink on the active match",
    kind: "text",
    on: "--find-match-selected-background",
  },
];

/** One mode cell: canvas-backed tile (fill / line / text) + resolved value. */
function ModeSwatch({
  paint,
  token,
  kind,
  on,
}: {
  paint: TokenContext;
  token: string;
  kind: HierarchyKind;
  on?: string;
}) {
  const triplet = paint.resolve(`var(${token})`).trim();
  const canvas = paint.color("--bg-canvas");
  const hairline = paint.color("--border");
  let tile: ReactNode;
  if (kind === "line") {
    tile = (
      <div
        className="h-8 rounded-sm border-2"
        style={{
          background: paint.color("--bg-card"),
          borderColor: paint.color(token),
        }}
        title={triplet}
      />
    );
  } else if (kind === "text") {
    tile = (
      <div
        className="flex h-8 items-center justify-center rounded-sm border text-xs font-bold"
        style={{
          background: on ? paint.color(on) : canvas,
          borderColor: hairline,
          color: paint.color(token),
        }}
        title={triplet}
      >
        Aa
      </div>
    );
  } else {
    tile = (
      <div
        className="h-8 rounded-sm border"
        style={{ background: paint.color(token), borderColor: hairline }}
        title={triplet}
      />
    );
  }
  return (
    <div
      className="rounded-md border p-1.5"
      style={{ background: canvas, borderColor: hairline }}
    >
      {tile}
      <code
        className="mt-1 block truncate font-mono text-[10px] leading-4"
        style={{ color: paint.color("--text-tertiary") }}
        title={triplet}
      >
        {triplet}
      </code>
    </div>
  );
}

const HIERARCHY_GRID =
  "grid grid-cols-[minmax(140px,auto)_minmax(220px,1fr)_150px_150px] gap-x-4";

/** Kumo-style hierarchy table: token chip, purpose, light + dark swatches. */
function HierarchySection({
  title,
  blurb,
  rows,
  kind = "fill",
  specimen,
  footnote,
  lightCtx,
  darkCtx,
}: {
  title: string;
  blurb: ReactNode;
  rows: HierarchyRow[];
  /** Section default; rows can override. */
  kind?: HierarchyKind;
  /** Optional demo rendered once per mode above the table. */
  specimen?: (paint: TokenContext) => ReactNode;
  footnote?: ReactNode;
  lightCtx: TokenContext;
  darkCtx: TokenContext;
}) {
  return (
    <PageSection
      title={title}
      blurb={blurb}
      aside={
        <InlineCode>
          {rows.length} token{rows.length === 1 ? "" : "s"}
        </InlineCode>
      }
    >
      {specimen && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { label: "light", paint: lightCtx },
            { label: "dark", paint: darkCtx },
          ].map(({ label, paint }) => (
            <div key={label} className="flex flex-col gap-1.5">
              <Eyebrow>{label}</Eyebrow>
              {specimen(paint)}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col">
        <div className={`${HIERARCHY_GRID} border-b pb-1.5`}>
          <Eyebrow>Token</Eyebrow>
          <Eyebrow>Purpose</Eyebrow>
          <Eyebrow>Light</Eyebrow>
          <Eyebrow>Dark</Eyebrow>
        </div>
        {rows.map((row) => (
          <div
            key={row.utility}
            className={`${HIERARCHY_GRID} items-center border-b py-2.5`}
          >
            <div className="min-w-0">
              <code className="rounded-md border px-2 py-0.5 font-mono text-[11px]">
                {row.utility}
              </code>
            </div>
            <span className="text-secondary text-sm">{row.purpose}</span>
            <ModeSwatch
              paint={lightCtx}
              token={row.token}
              kind={row.kind ?? kind}
              on={row.on}
            />
            <ModeSwatch
              paint={darkCtx}
              token={row.token}
              kind={row.kind ?? kind}
              on={row.on}
            />
          </div>
        ))}
      </div>
      {footnote && <p className="text-tertiary text-sm">{footnote}</p>}
    </PageSection>
  );
}

/* ------------------------------------------------------------------------- *
 * Specimens rendered once per mode above their tables.
 * ------------------------------------------------------------------------- */

/** Text tiers stacked as one specimen, so the gap between tiers is legible. */
function TextHierarchySample({ paint }: { paint: TokenContext }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-md border p-3"
      style={{
        background: paint.color("--background"),
        borderColor: paint.color("--border"),
      }}
    >
      <span
        className="text-sm font-bold"
        style={{ color: paint.color("--text-primary") }}
      >
        Bright — titles, active states
      </span>
      <span
        className="text-sm"
        style={{ color: paint.color("--text-secondary") }}
      >
        Body — default copy sits one tier down.
      </span>
      <span
        className="text-xs"
        style={{ color: paint.color("--text-tertiary") }}
      >
        meta — captions and labels
      </span>
      <span
        className="text-xs"
        style={{ color: paint.color("--text-disabled") }}
      >
        faint — placeholders and disabled
      </span>
    </div>
  );
}

function QuerySample({ ctx }: { ctx: TokenContext }) {
  return (
    <div
      className="rounded-md border px-2.5 py-1.5 font-mono text-xs"
      style={{
        background: ctx.color("--background"),
        borderColor: ctx.color("--border"),
      }}
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

function FindMatchSample({ ctx }: { ctx: TokenContext }) {
  return (
    <div
      className="rounded-md border px-2.5 py-1.5 text-xs"
      style={{
        background: ctx.color("--background"),
        borderColor: ctx.color("--border"),
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

/** chart-1..8 as one compact strip (full reference on the Charts page). */
function ChartRampStrip({ paint }: { paint: TokenContext }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border p-2"
      style={{
        background: paint.color("--bg-canvas"),
        borderColor: paint.color("--border"),
      }}
    >
      {Array.from({ length: 8 }, (_, i) => `--chart-${i + 1}`).map((token) => (
        <span
          key={token}
          className="h-6 flex-1 rounded-sm"
          style={{ background: paint.color(token) }}
          title={token}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Collapsed low-traffic groups.
 * ------------------------------------------------------------------------- */

/** PR-preview deployment strip chrome (its links ride --link). */
const PREVIEW_BANNER_TOKENS = [
  "--preview-banner",
  "--preview-banner-foreground",
  "--preview-banner-border",
  "--preview-banner-link",
  "--preview-banner-link-hover",
];

/** Old shadcn names kept as pure var() references onto the role vocabulary. */
const LEGACY_ALIAS_TOKENS = [
  "--background",
  "--foreground",
  "--muted-foreground",
  "--card-foreground",
  "--popover-foreground",
  "--primary-foreground",
  "--accent",
  "--accent-foreground",
  "--input",
  "--popover-border",
  "--ring",
  "--sidebar-ring",
];

/** Tailwind color mappings from @theme inline (collapsed, low traffic). */
function ColorMappingsSection({ ctx }: { ctx: TokenContext }) {
  const colorMappings = parsed.inlineTokens.filter(
    (t) => t.name.startsWith("--color-") && t.value !== "initial",
  );
  const disabled = parsed.inlineTokens.filter((t) => t.value === "initial");

  return (
    <details className="group border-t pt-6">
      <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="text-tertiary mt-1.5 size-4 shrink-0 transition-transform group-open:rotate-90"
        />
        <div className="flex flex-1 items-baseline justify-between gap-4">
          <div>
            <h2 className="text-foreground text-lg font-bold">
              Tailwind color mappings
            </h2>
            <p className="text-tertiary max-w-2xl text-sm">
              @theme inline: utility → token wiring plus the disabled built-in
              palettes.
            </p>
          </div>
          <InlineCode>{colorMappings.length} tokens</InlineCode>
        </div>
      </summary>
      <div className="flex flex-col gap-6 pt-3 pl-6">
        <div className="columns-1 gap-8 md:columns-2 xl:columns-3">
          {colorMappings.map((token) => (
            <div
              key={token.name}
              className="border-border flex items-center gap-2 border-b py-1 font-mono text-[11px] leading-4"
            >
              <Swatch color={toCssColor(ctx.resolve(token.value))} />
              <code className="text-foreground shrink-0">{token.name}</code>
              <span className="text-tertiary truncate" title={token.value}>
                {token.value}
              </span>
            </div>
          ))}
        </div>
        {disabled.length > 0 && (
          <p className="text-tertiary font-mono text-[11px]">
            Disabled built-in palettes:{" "}
            {disabled
              .map((token) =>
                token.name.replace("--color-", "").replace("-*", ""),
              )
              .join(", ")}
          </p>
        )}
      </div>
    </details>
  );
}

const ALL_HIERARCHIES: HierarchyRow[][] = [
  SURFACE_HIERARCHY,
  BORDER_HIERARCHY,
  TEXT_HIERARCHY,
  BRAND_HIERARCHY,
  STATUS_HIERARCHY,
  CONTROL_HIERARCHY,
  SIDEBAR_HIERARCHY,
  VIZ_HIERARCHY,
  QLANG_HIERARCHY,
  FIND_MATCH_HIERARCHY,
];

/** Every token some section on this page documents. */
const documentedTokens = new Set([
  ...ALL_HIERARCHIES.flat().map((row) => row.token),
  ...LEGACY_ALIAS_TOKENS,
  ...PREVIEW_BANNER_TOKENS,
]);

export function Color() {
  const { ctx, lightCtx, darkCtx } = useTokenContexts();

  const primitiveEntries = rootEntries.filter((entry) =>
    PRIMITIVE_PATTERN.test(entry.name),
  );
  const entriesFor = (names: string[]) =>
    names.flatMap((name) => {
      const entry = rootEntries.find((candidate) => candidate.name === name);
      return entry ? [entry] : [];
    });
  const aliasEntries = entriesFor(LEGACY_ALIAS_TOKENS);
  const previewBannerEntries = entriesFor(PREVIEW_BANNER_TOKENS);
  // Completeness guard: color-page tokens with no hierarchy row yet still
  // show up here instead of silently vanishing.
  const undocumentedEntries = rootEntries.filter(
    (entry) =>
      pageForToken(entry.name) === "color" &&
      !PRIMITIVE_PATTERN.test(entry.name) &&
      !documentedTokens.has(entry.name),
  );

  const hierarchyCount = ALL_HIERARCHIES.reduce(
    (total, rows) => total + rows.length,
    0,
  );

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
        <PageHeader
          eyebrow="Design tokens"
          title="Color"
          lede={
            <>
              Parsed at build time from{" "}
              <code className="font-mono">src/styles/globals.css</code>. Each
              family is one hierarchy table: token, purpose, light and dark side
              by side.
            </>
          }
          meta={<>{hierarchyCount} role tokens · light and dark</>}
        />
        <HierarchySection
          title="Surface hierarchy"
          blurb="Surfaces establish depth and layering. Use them in order, outermost first."
          rows={SURFACE_HIERARCHY}
          kind="fill"
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <HierarchySection
          title="Borders & rings"
          blurb="Two line tiers plus the focus ring. Hover = the fill, focus = the ring."
          rows={BORDER_HIERARCHY}
          kind="line"
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <HierarchySection
          title="Text colors"
          blurb="faint < meta < body < bright — color carries state, weight never changes."
          rows={TEXT_HIERARCHY}
          kind="text"
          specimen={(paint) => <TextHierarchySample paint={paint} />}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <HierarchySection
          title="Brand & interactive"
          blurb="The brand accent and the strong action fills."
          rows={BRAND_HIERARCHY}
          footnote={
            <>
              Links live in Text colors; the focus ring in Borders &amp; rings.
              Disabled is <InlineCode>opacity-50</InlineCode> on the enabled
              colors — no dedicated token.
            </>
          }
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <HierarchySection
          title="Status"
          blurb="light-* tint fills (alpha baked in) with dark-* text on them — slated for role-naming (danger/success/…-tint)."
          rows={STATUS_HIERARCHY}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <HierarchySection
          title="Controls"
          blurb="Checkbox / switch fill, off-state track and unchecked boundary."
          rows={CONTROL_HIERARCHY}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <HierarchySection
          title="Sidebar"
          blurb="Nav chrome states — the frame fill itself sits in the surface hierarchy."
          rows={SIDEBAR_HIERARCHY}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <HierarchySection
          title="Charts & viz"
          blurb="Muted chromatic accents; the categorical chart ramp lives on the Charts page."
          rows={VIZ_HIERARCHY}
          specimen={(paint) => <ChartRampStrip paint={paint} />}
          footnote={
            <>
              Specimen: <InlineCode>chart-1 … chart-8</InlineCode> — the
              categorical series ramp (full reference on the Charts page).
            </>
          }
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <HierarchySection
          title="Search syntax"
          blurb="An editor-style syntax theme for the search grammar — deliberately not the app palette; operators ride muted-foreground."
          rows={QLANG_HIERARCHY}
          kind="text"
          specimen={(paint) => <QuerySample ctx={paint} />}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <HierarchySection
          title="Find match"
          blurb="In-page search highlight and the selected match."
          rows={FIND_MATCH_HIERARCHY}
          specimen={(paint) => <FindMatchSample ctx={paint} />}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <div className="flex flex-col gap-6">
          <CollapsedSection
            title="Palette primitives"
            blurb="Private {family}-{mode}-{decade} ramps behind the role tokens — components never reference these."
            count={primitiveEntries.length}
          >
            {primitiveEntries.map((entry) => (
              <TokenRow
                key={entry.name}
                name={entry.name}
                entry={entry}
                ctx={ctx}
                lightCtx={lightCtx}
                darkCtx={darkCtx}
                sample={null}
              />
            ))}
          </CollapsedSection>
          <CollapsedSection
            title="Deprecated shadcn aliases"
            blurb="Pure var() references onto the role vocabulary — never their own raw values; new code uses the role tokens."
            count={aliasEntries.length}
          >
            {aliasEntries.map((entry) => (
              <TokenRow
                key={entry.name}
                name={entry.name}
                entry={entry}
                ctx={ctx}
                lightCtx={lightCtx}
                darkCtx={darkCtx}
                sample={null}
              />
            ))}
          </CollapsedSection>
          <CollapsedSection
            title="Preview banner"
            blurb="The PR-preview deployment strip — its links ride --link."
            count={previewBannerEntries.length}
          >
            {previewBannerEntries.map((entry) => (
              <TokenRow
                key={entry.name}
                name={entry.name}
                entry={entry}
                ctx={ctx}
                lightCtx={lightCtx}
                darkCtx={darkCtx}
                sample={null}
              />
            ))}
          </CollapsedSection>
          {undocumentedEntries.length > 0 && (
            <CollapsedSection
              title="Other"
              blurb="Color tokens with no hierarchy row yet. Give each one a home."
              count={undocumentedEntries.length}
            >
              {undocumentedEntries.map((entry) => (
                <TokenRow
                  key={entry.name}
                  name={entry.name}
                  entry={entry}
                  ctx={ctx}
                  lightCtx={lightCtx}
                  darkCtx={darkCtx}
                  sample={null}
                />
              ))}
            </CollapsedSection>
          )}
          <ColorMappingsSection ctx={ctx} />
          {unassignedTokens.length > 0 && (
            <CollapsedSection
              title="Unassigned tokens"
              blurb="Tokens no reference page claims yet (PAGE_TOKEN_MATCHERS in shared.tsx). Give each one a home."
              count={unassignedTokens.length}
            >
              {unassignedTokens.map((name) => {
                const { entry, staticDecl } = findTokenDeclaration(name);
                return (
                  <TokenRow
                    key={name}
                    name={name}
                    entry={entry}
                    staticDecl={staticDecl}
                    ctx={ctx}
                    lightCtx={lightCtx}
                    darkCtx={darkCtx}
                    sample={null}
                  />
                );
              })}
            </CollapsedSection>
          )}
        </div>
      </div>
    </div>
  );
}
