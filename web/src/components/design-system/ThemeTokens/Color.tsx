/**
 * Storybook-only color reference (Design → Color): the three role ramps
 * (text, surface, line) with light and dark side by side, then the full
 * token tables. Role tokens ride the private palette ramps
 * ({family}-{mode}-{decade}) in globals.css; the palette lives in the
 * collapsed primitives section.
 *
 * Every value is parsed at build time from `src/styles/globals.css` (see
 * parseThemeTokens.ts), so the page cannot drift from the stylesheet.
 * Samples repaint under the active Storybook theme (toolbar switcher).
 */
import { ChevronRight } from "lucide-react";
import { type CSSProperties, type ReactNode } from "react";

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
  TokenSection,
  unassignedTokens,
  useTokenContexts,
} from "./shared";
import { toCssColor } from "./parseThemeTokens";

/* ------------------------------------------------------------------------- *
 * Role ramps. Each step shows the role token, a usage one-liner, and both
 * modes' resolved values side by side — all derived from the parsed
 * stylesheet, never hardcoded.
 * ------------------------------------------------------------------------- */

/** The private palette steps components must never reference. */
const PRIMITIVE_PATTERN = /^--(?:neutral|blue)-(?:light|dark)-\d+$/;

type RampKind = "text" | "surface" | "border";

type RampStep = {
  token: string;
  label: string;
  note?: string;
};

const TEXT_RAMP: RampStep[] = [
  {
    token: "--text-disabled",
    label: "faint",
    note: "placeholders, disabled, hints",
  },
  {
    token: "--text-tertiary",
    label: "meta",
    note: "captions, labels, secondary cells",
  },
  { token: "--text-secondary", label: "body", note: "default copy" },
  {
    token: "--text-primary",
    label: "bright",
    note: "emphasis, titles, active nav — and the primary button fill",
  },
  {
    token: "--text-on-fill",
    label: "on-fill",
    note: "inverted ink on bright fills — rides the canvas color",
  },
];

/** Kumo-style surface hierarchy: token chip · purpose · per-mode swatches. */
type SurfaceRow = { utility: string; token: string; purpose: ReactNode };

const SURFACE_HIERARCHY: SurfaceRow[] = [
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

const BORDER_RAMP: RampStep[] = [
  {
    token: "--border",
    label: "hairline",
    note: "the default edge on every surface tier",
  },
  {
    token: "--border-contrast",
    label: "contrast",
    note: "structural/viz lines: tree connectors, timeline grid",
  },
];

/** One mode's cell: a self-contained mini-mode tile + the resolved HSL. */
function RampModeCell({
  paint,
  token,
  kind,
}: {
  paint: TokenContext;
  token: string;
  kind: RampKind;
}) {
  const triplet = paint.resolve(`var(${token})`).trim();
  const canvas = paint.color("--background");
  const hairline = paint.color("--border");
  let demo: ReactNode;
  if (kind === "text") {
    const onBright = token === "--text-on-fill";
    demo = (
      <div
        className="truncate rounded-sm px-2.5 py-1.5 text-xs"
        title="Aa · The quick brown fox"
        style={{
          background: onBright ? paint.color("--primary") : canvas,
          color: paint.color(token),
        }}
      >
        Aa · The quick brown fox
      </div>
    );
  } else if (kind === "surface") {
    demo = (
      <div className="p-2" style={{ background: canvas }}>
        <div
          className="h-7 rounded-sm border"
          style={{ background: paint.color(token), borderColor: hairline }}
        />
      </div>
    );
  } else {
    demo = (
      <div className="p-2" style={{ background: canvas }}>
        <div
          className="h-7 rounded-sm border"
          style={{
            background: paint.color("--bg-card"),
            borderColor: paint.color(token),
          }}
        />
      </div>
    );
  }
  return (
    <div
      className="flex min-w-0 flex-col overflow-hidden rounded-md border"
      style={{ background: canvas, borderColor: hairline }}
    >
      {demo}
      <code
        className="truncate border-t px-2 py-1 font-mono text-[10px] leading-4"
        style={{
          color: paint.color("--muted-foreground"),
          borderColor: hairline,
        }}
        title={triplet}
      >
        {triplet}
      </code>
    </div>
  );
}

const RAMP_GRID =
  "grid grid-cols-[minmax(240px,1.3fr)_minmax(170px,1fr)_minmax(170px,1fr)] gap-x-4";

function RampRow({
  step,
  index,
  kind,
  lightCtx,
  darkCtx,
}: {
  step: RampStep;
  index: number;
  kind: RampKind;
  lightCtx: TokenContext;
  darkCtx: TokenContext;
}) {
  return (
    <div className={`${RAMP_GRID} items-center border-b py-2.5`}>
      <div className="flex min-w-0 flex-col gap-1">
        <Eyebrow>
          {index + 1} · {step.label}
        </Eyebrow>
        <code className="text-foreground font-mono text-[11px] leading-4 break-all">
          {step.token}
        </code>
        {step.note && (
          <span className="text-tertiary text-[11px] leading-4">
            {step.note}
          </span>
        )}
      </div>
      <RampModeCell paint={lightCtx} token={step.token} kind={kind} />
      <RampModeCell paint={darkCtx} token={step.token} kind={kind} />
    </div>
  );
}

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

/** One mode cell for the surface hierarchy: swatch + resolved value. */
function SurfaceSwatch({
  paint,
  token,
}: {
  paint: TokenContext;
  token: string;
}) {
  const triplet = paint.resolve(`var(${token})`).trim();
  return (
    <div
      className="rounded-md border p-1.5"
      style={{
        background: paint.color("--bg-canvas"),
        borderColor: paint.color("--border"),
      }}
    >
      <div
        className="h-8 rounded-sm border"
        style={{
          background: paint.color(token),
          borderColor: paint.color("--border"),
        }}
        title={triplet}
      />
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

const SURFACE_GRID =
  "grid grid-cols-[140px_minmax(220px,1fr)_150px_150px] gap-x-4";

/** Kumo-style hierarchy table: token chip, purpose, light + dark swatches. */
function SurfaceHierarchySection({
  lightCtx,
  darkCtx,
}: {
  lightCtx: TokenContext;
  darkCtx: TokenContext;
}) {
  return (
    <PageSection
      title="Surface hierarchy"
      blurb="Surfaces establish depth and layering. Use them in order, outermost first."
      aside={<InlineCode>{SURFACE_HIERARCHY.length} surfaces</InlineCode>}
    >
      <div className="flex flex-col">
        <div className={`${SURFACE_GRID} border-b pb-1.5`}>
          <Eyebrow>Token</Eyebrow>
          <Eyebrow>Purpose</Eyebrow>
          <Eyebrow>Light</Eyebrow>
          <Eyebrow>Dark</Eyebrow>
        </div>
        {SURFACE_HIERARCHY.map((row) => (
          <div
            key={row.utility}
            className={`${SURFACE_GRID} items-center border-b py-2.5`}
          >
            <div>
              <code className="rounded-md border px-2 py-0.5 font-mono text-[11px]">
                {row.utility}
              </code>
            </div>
            <span className="text-secondary text-sm">{row.purpose}</span>
            <SurfaceSwatch paint={lightCtx} token={row.token} />
            <SurfaceSwatch paint={darkCtx} token={row.token} />
          </div>
        ))}
      </div>
    </PageSection>
  );
}

function RampSection({
  title,
  blurb,
  steps,
  kind,
  renderModeSample,
  lightCtx,
  darkCtx,
}: {
  title: string;
  blurb: string;
  steps: RampStep[];
  kind: RampKind;
  renderModeSample?: (paint: TokenContext) => ReactNode;
  lightCtx: TokenContext;
  darkCtx: TokenContext;
}) {
  return (
    <PageSection
      title={title}
      blurb={blurb}
      aside={<InlineCode>{steps.length} steps</InlineCode>}
    >
      {renderModeSample && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { label: "light", paint: lightCtx },
            { label: "dark", paint: darkCtx },
          ].map(({ label, paint }) => (
            <div key={label} className="flex flex-col gap-1.5">
              <Eyebrow>{label}</Eyebrow>
              {renderModeSample(paint)}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col">
        <div className={`${RAMP_GRID} border-b pb-1.5`}>
          <Eyebrow>Step · token</Eyebrow>
          <Eyebrow>Light</Eyebrow>
          <Eyebrow>Dark</Eyebrow>
        </div>
        {steps.map((step, index) => (
          <RampRow
            key={step.token}
            step={step}
            index={index}
            kind={kind}
            lightCtx={lightCtx}
            darkCtx={darkCtx}
          />
        ))}
      </div>
    </PageSection>
  );
}

type SectionId =
  | "primitives"
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
  | "other";

/**
 * First match wins; unmatched tokens land in "other" so new tokens always
 * show up somewhere. Tokens other pages own are excluded up front via
 * pageForToken (shared.tsx), the single source of page assignment.
 */
const SECTION_MATCHERS: Array<{
  id: SectionId;
  test: (name: string) => boolean;
}> = [
  { id: "primitives", test: (n) => PRIMITIVE_PATTERN.test(n) },
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
  { id: "controls", test: (n) => n.startsWith("--control-") },
  {
    id: "brand",
    test: (n) => /^--(?:primary-accent|link|link-hover)$/.test(n),
  },
  {
    id: "borders",
    test: (n) =>
      /^--(?:border|border-contrast|popover-border|input|ring|focus)$/.test(n),
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
      /^--(?:bg-(?:canvas|code(?:-header)?|hover|muted|popover|card|modal|sidebar)|background|foreground|text-disabled|muted|canvas|code|hover|popover|card|modal)(?:-foreground)?$/.test(
        n,
      ),
  },
];

type SectionDef = { id: SectionId; title: string; blurb: string };

/** High-traffic sections, always expanded. */
const VISIBLE_SECTIONS: SectionDef[] = [
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
    id: "sidebar",
    title: "Sidebar",
    blurb: "Side navigation chrome, nav-item states and its hairline.",
  },
];

/** Low-traffic sections, collapsed at the bottom. */
const COLLAPSED_SECTIONS: SectionDef[] = [
  {
    id: "primitives",
    title: "Palette primitives",
    blurb:
      "Private {family}-{mode}-{decade} ramps behind the role tokens — components never reference these.",
  },
  {
    id: "qlang",
    title: "Query syntax highlighting",
    blurb: "Search-bar grammar colors (field / value / number / keyword).",
  },
  {
    id: "findMatch",
    title: "Find match",
    blurb: "In-page search highlight and the selected match.",
  },
  {
    id: "other",
    title: "Other",
    blurb: "Tokens this page has no dedicated section for yet.",
  },
];

/** `hsl(triplet / alpha)` for a token, for utility classes like bg-muted/50. */
function alphaColor(ctx: TokenContext, name: string, alpha: number) {
  const triplet = ctx.resolve(`var(${name})`);
  return toCssColor(triplet)?.replace(/\)$/, ` / ${alpha})`);
}

/* ------------------------------------------------------------------------- *
 * Interaction states (Carbon-style), grounded in the app's real classes.
 * ------------------------------------------------------------------------- */

function StateRow({
  state,
  sample,
  classes,
  tokens,
  seenIn,
}: {
  state: string;
  sample: ReactNode;
  classes: string;
  tokens: string;
  seenIn: string;
}) {
  return (
    <div className="grid items-center gap-x-8 gap-y-1 border-t py-3 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.2fr)]">
      <Eyebrow>{state}</Eyebrow>
      <div className="min-w-0">{sample}</div>
      <div className="text-tertiary flex min-w-0 flex-col gap-0.5 font-mono text-[10px] leading-4">
        <span className="break-all">{classes}</span>
        <span>tokens · {tokens}</span>
        <span>as in · {seenIn}</span>
      </div>
    </div>
  );
}

function InteractionStatesSection({ ctx }: { ctx: TokenContext }) {
  const color = ctx.color;
  const rowBase: CSSProperties = {
    background: color("--background"),
    color: color("--foreground"),
  };
  return (
    <PageSection
      title="Interaction states"
      blurb="Hover, selected, active and focus, painted with the exact classes the app uses."
    >
      <div className="flex flex-col">
        <StateRow
          state="Hover · row"
          classes="hover:bg-muted/50"
          tokens="--muted at 50%"
          seenIn="TableRow (ui/table.tsx)"
          sample={
            <div
              className="flex flex-col rounded-md border text-xs"
              style={rowBase}
            >
              <span className="border-b px-2.5 py-1.5">Default row</span>
              <span
                className="px-2.5 py-1.5"
                style={{ background: alphaColor(ctx, "--bg-muted", 0.5) }}
              >
                Hovered row
              </span>
            </div>
          }
        />
        <StateRow
          state="Selected · row"
          classes="data-[state=selected]:bg-muted"
          tokens="--bg-muted"
          seenIn="TableRow (ui/table.tsx)"
          sample={
            <div
              className="flex flex-col rounded-md border text-xs"
              style={rowBase}
            >
              <span className="border-b px-2.5 py-1.5">Default row</span>
              <span
                className="px-2.5 py-1.5"
                style={{ background: color("--bg-muted") }}
              >
                Selected row
              </span>
            </div>
          }
        />
        <StateRow
          state="Hover · item"
          classes="focus:bg-hover focus:text-on-hover / hover:bg-hover"
          tokens="--hover · --text-on-hover"
          seenIn="DropdownMenuItem, ghost & outline Button"
          sample={
            <div
              className="flex flex-col gap-0.5 rounded-md border p-1 text-xs"
              style={{ background: color("--bg-popover") }}
            >
              <span
                className="rounded-sm px-2 py-1"
                style={{ color: color("--popover-foreground") }}
              >
                Menu item
              </span>
              <span
                className="rounded-sm px-2 py-1"
                style={{
                  background: color("--accent"),
                  color: color("--accent-foreground"),
                }}
              >
                Focused item
              </span>
            </div>
          }
        />
        <StateRow
          state="Active · tab"
          classes="text-primary-accent + 2px underline"
          tokens="--primary-accent"
          seenIn="page-level tab bars"
          sample={
            <div
              className="flex items-center gap-3 rounded-md border px-2.5 py-1.5 text-xs"
              style={rowBase}
            >
              <span
                className="pb-0.5 font-bold"
                style={{
                  color: color("--primary-accent"),
                  boxShadow: `inset 0 -2px 0 ${color("--primary-accent")}`,
                }}
              >
                Active tab
              </span>
              <span style={{ color: color("--muted-foreground") }}>
                Other tab
              </span>
            </div>
          }
        />
        <StateRow
          state="Focus"
          classes="focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          tokens="--focus · ring-offset uses --canvas"
          seenIn="Button, Input, every focusable control"
          sample={
            <div
              className="rounded-md border px-2.5 py-1.5"
              style={{ background: color("--background") }}
            >
              <span
                className="inline-block rounded-md border px-2.5 py-0.5 text-xs"
                style={{
                  background: color("--bg-card"),
                  color: color("--foreground"),
                  boxShadow: `0 0 0 2px ${color("--background")}, 0 0 0 4px ${color("--ring")}`,
                }}
              >
                Focused
              </span>
            </div>
          }
        />
        <StateRow
          state="Disabled"
          classes="disabled:opacity-50 disabled:cursor-not-allowed"
          tokens="no dedicated token, opacity on the enabled colors"
          seenIn="Button, Input"
          sample={
            <div
              className="rounded-md border px-2.5 py-1.5"
              style={{ background: color("--background") }}
            >
              <span
                className="inline-block rounded-md px-2.5 py-0.5 text-xs opacity-50"
                style={{
                  background: color("--primary"),
                  color: color("--primary-foreground"),
                }}
              >
                Disabled button
              </span>
            </div>
          }
        />
      </div>
    </PageSection>
  );
}

/* ------------------------------------------------------------------------- *
 * Per-token usage samples (compact, one per row).
 * ------------------------------------------------------------------------- */

function SurfaceSample({
  background,
  color,
  border,
  children,
}: {
  background?: string;
  color?: string;
  border?: string;
  children: string;
}) {
  return (
    <div
      className="truncate rounded-md border px-2.5 py-1.5 text-xs"
      title={children}
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

function QuerySample({ ctx }: { ctx: TokenContext }) {
  return (
    <div
      className="rounded-md border px-2.5 py-1.5 font-mono text-xs"
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

function FindMatchSample({ ctx }: { ctx: TokenContext }) {
  return (
    <div
      className="rounded-md border px-2.5 py-1.5 text-xs"
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

function renderSample(
  sectionId: SectionId,
  name: string,
  ctx: TokenContext,
): ReactNode {
  const color = ctx.color;
  switch (sectionId) {
    case "surfaces": {
      const isText = name.includes("foreground");
      if (isText) {
        let base = name.replace(/-foreground$/, "");
        if (name === "--foreground" || name === "--text-disabled")
          base = "--background";
        if (name === "--muted-foreground") base = "--bg-muted";
        return (
          <SurfaceSample background={color(base)} color={color(name)}>
            Aa · The quick brown fox
          </SurfaceSample>
        );
      }
      const pairedText = ctx.decl(`${name}-foreground`)
        ? `${name}-foreground`
        : "--foreground";
      return (
        <SurfaceSample background={color(name)} color={color(pairedText)}>
          {`Aa · text on ${name.slice(2)}`}
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
          className="rounded-md border px-2.5 py-1.5"
          style={{ background: color("--background") }}
        >
          <span
            className="inline-block rounded-md px-2.5 py-0.5 text-xs"
            style={{ background: color(base), color: color(fg) }}
          >
            Button
          </span>
        </div>
      );
    }
    case "borders": {
      if (name === "--ring" || name === "--focus") {
        return (
          <div
            className="rounded-md border px-2.5 py-1.5"
            style={{ background: color("--background") }}
          >
            <span
              className="inline-block rounded-md border px-2.5 py-0.5 text-xs"
              style={{
                background: color("--bg-card"),
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
          background={color("--bg-card")}
          color={color("--foreground")}
          border={color(name)}
        >
          {`Aa · ${name.slice(2)} edge`}
        </SurfaceSample>
      );
    }
    case "brand": {
      if (name === "--primary-accent") {
        return (
          <div
            className="flex items-center gap-3 rounded-md border px-2.5 py-1.5 text-xs"
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
          className="rounded-md border px-2.5 py-1.5 text-xs"
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
          className="flex items-center gap-4 rounded-md border px-2.5 py-1.5"
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
              style={{ background: color("--bg-card") }}
            />
          </span>
        </div>
      );
    }
    case "mutedAccents": {
      return (
        <div
          className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
          style={{ background: color("--bg-card") }}
        >
          <span
            className="size-3.5 rounded-sm"
            style={{ background: color(name) }}
          />
          <span style={{ color: color(name) }} className="font-bold">
            Aa
          </span>
          <span
            style={{ color: color("--muted-foreground") }}
            className="text-[10px]"
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
          className="rounded-md border px-2.5 py-1.5"
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
    // Whole-section samples (all tokens paint the same demo) render once in
    // the section header instead of repeating per row.
    case "qlang":
    case "findMatch":
      return null;
    case "sidebar": {
      if (name === "--sidebar-ring") {
        return (
          <div
            className="rounded-md border px-2.5 py-1.5"
            style={{ background: color("--sidebar-background") }}
          >
            <span
              className="inline-block rounded-md px-2 py-0.5 text-xs"
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
            Aa · sidebar hairline
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
          className="flex items-center gap-1 rounded-md border p-1 text-xs"
          style={{
            background: color("--sidebar-background"),
            borderColor: color("--sidebar-border"),
          }}
        >
          <span
            className="truncate rounded-md px-2 py-0.5"
            title={itemLabel}
            style={itemStyle}
          >
            {itemLabel}
          </span>
          <span
            className="truncate px-2 py-0.5"
            title="Another item"
            style={{ color: color("--sidebar-foreground") }}
          >
            Another item
          </span>
        </div>
      );
    }
    case "other":
    default: {
      const swatchColor = color(name);
      return (
        <div
          className="rounded-md border px-2.5 py-1.5 font-mono text-[11px]"
          style={{
            background: color("--background"),
            color: color("--foreground"),
          }}
        >
          {swatchColor ? (
            <span
              className="inline-block h-4 w-14 rounded-sm"
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

/** Section demos rendered once (their tokens all paint the same sample). */
const SECTION_SAMPLES: Partial<
  Record<SectionId, (ctx: TokenContext) => ReactNode>
> = {
  qlang: (ctx) => <QuerySample ctx={ctx} />,
  findMatch: (ctx) => <FindMatchSample ctx={ctx} />,
};

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

export function Color() {
  const { ctx, lightCtx, darkCtx } = useTokenContexts();

  const sectionEntries = new Map<SectionId, typeof rootEntries>();
  for (const entry of rootEntries) {
    if (pageForToken(entry.name) !== "color") continue; // other pages own these
    const matcher = SECTION_MATCHERS.find((m) => m.test(entry.name));
    const section = matcher?.id ?? "other";
    const bucket = sectionEntries.get(section) ?? [];
    bucket.push(entry);
    sectionEntries.set(section, bucket);
  }

  const colorEntryCount = [...sectionEntries.values()].reduce(
    (total, bucket) => total + bucket.length,
    0,
  );
  const renderRows = (id: SectionId) =>
    (sectionEntries.get(id) ?? []).map((entry) => (
      <TokenRow
        key={entry.name}
        name={entry.name}
        entry={entry}
        ctx={ctx}
        lightCtx={lightCtx}
        darkCtx={darkCtx}
        sample={renderSample(id, entry.name, ctx)}
      />
    ));

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
        <PageHeader
          eyebrow="Design tokens"
          title="Color"
          lede={
            <>
              Parsed at build time from{" "}
              <code className="font-mono">src/styles/globals.css</code>. Role
              ramps up top show light and dark side by side; the tables below
              are the full token reference, sampled per toolbar theme.
            </>
          }
          meta={<>{colorEntryCount} color tokens · light and dark</>}
        />
        <RampSection
          title="Text ramp"
          blurb="faint < meta < body < bright, plus the inverted ink — color carries state, weight never changes."
          steps={TEXT_RAMP}
          kind="text"
          renderModeSample={(paint) => <TextHierarchySample paint={paint} />}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <SurfaceHierarchySection lightCtx={lightCtx} darkCtx={darkCtx} />
        <RampSection
          title="Border / line ramp"
          blurb="Two tiers: quiet hairline < assertive contrast."
          steps={BORDER_RAMP}
          kind="border"
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <InteractionStatesSection ctx={ctx} />
        {VISIBLE_SECTIONS.map(({ id, title, blurb }) => {
          const rows = renderRows(id);
          if (rows.length === 0) return null;
          return (
            <TokenSection
              key={id}
              title={title}
              blurb={blurb}
              count={rows.length}
              sectionSample={SECTION_SAMPLES[id]?.(ctx)}
            >
              {rows}
            </TokenSection>
          );
        })}
        <div className="flex flex-col gap-6">
          {COLLAPSED_SECTIONS.map(({ id, title, blurb }) => {
            const rows = renderRows(id);
            if (rows.length === 0) return null;
            return (
              <CollapsedSection
                key={id}
                title={title}
                blurb={blurb}
                count={rows.length}
                sectionSample={SECTION_SAMPLES[id]?.(ctx)}
              >
                {rows}
              </CollapsedSection>
            );
          })}
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
