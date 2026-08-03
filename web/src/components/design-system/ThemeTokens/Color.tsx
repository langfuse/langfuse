/**
 * Storybook-only color reference (Design → Color), modeled on Carbon's color
 * docs (interaction states) and Kumo's semantic-token tables (token rows
 * grouped by role, purpose-first blurbs).
 *
 * Primary content: the three NEUTRAL RAMPS (text, background/surface,
 * border/line) of the redesigned two-layer token system — private primitives
 * rebound per mode, semantic tokens riding them. Each ramp step renders its
 * light and dark cells side by side (independent of the toolbar theme) so
 * both modes review at a glance. The nested surface stack also appears on
 * the Layout page's layering model.
 *
 * Every value is parsed at build time from `src/styles/globals.css` (see
 * parseThemeTokens.ts), so the page cannot drift from the stylesheet. Dense
 * rows show light and dark side by side with a compact live usage sample;
 * samples repaint under the active Storybook theme (toolbar switcher).
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
 * Neutral ramps (the redesigned two-layer token system).
 *
 * globals.css defines PRIVATE primitives (--surface-1..8, --line-1..2,
 * --text-1..4, --text-on-bright) bound per mode in :root/.dark, and the
 * semantic tokens ride them via var() — defined once. The three ramp
 * sections below are the primary review surface: every step shows LIGHT AND
 * DARK side by side (independent of the toolbar theme), the semantic
 * token(s) riding the step, and the resolved HSL per mode. All of it is
 * derived from the parsed stylesheet, never hardcoded.
 * ------------------------------------------------------------------------- */

/** The private ladder-step primitives components must never reference. */
const PRIMITIVE_PATTERN =
  /^--(?:surface-\d+|line-\d+|text-\d+|text-on-bright)$/;

/**
 * The approved role vocabulary. The docs present these as THE names (final
 * state); the underlying CSS custom property is shown as small print until
 * the code migration lands and they become one and the same.
 */
const UPCOMING_ROLES: Record<string, string> = {
  "--primary": "text-primary",
  "--foreground": "text-secondary",
  "--muted-foreground": "text-tertiary",
  "--foreground-tertiary": "text-disabled",
  "--primary-foreground": "text-on-fill",
  "--accent-foreground": "text-on-hover",
  "--background": "bg-canvas",
  "--sidebar-background": "bg-sidebar",
  "--card": "bg-card",
  "--modal": "bg-modal",
  "--popover": "bg-popover",
  "--surface-code": "bg-code",
  "--muted": "bg-muted",
  "--accent": "bg-hover",
  "--border": "border",
  "--input": "border-edge",
  "--popover-border": "border-edge",
  "--ring": "focus",
};

/**
 * Semantic tokens whose :root declaration rides `var(--primitive)` directly.
 * Computed from the parsed stylesheet so rewiring a semantic token in
 * globals.css re-labels the ramp automatically.
 */
function ridersOf(primitive: string): string[] {
  const reference = new RegExp(`var\\(\\s*${primitive}\\s*\\)`);
  return parsed.light
    .filter(
      (declaration) =>
        !PRIMITIVE_PATTERN.test(declaration.name) &&
        reference.test(declaration.value),
    )
    .map((declaration) => declaration.name);
}

type RampKind = "text" | "surface" | "border";

type RampStep = {
  /** The primitive the step documents (a semantic token also works: its
   *  declared per-mode values render instead of a "rides …" caption). */
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
    note: "captions and labels — merges into body in dark (60 = 60); distinct in light",
  },
  { token: "--text-secondary", label: "body", note: "default copy" },
  {
    token: "--text-primary",
    label: "bright",
    note: "emphasis, titles, active nav — and the primary button fill. Light runs the ramp the other way: bright is the DARKEST step (9 < 22 < 46.9 < 62).",
  },
  {
    token: "--text-on-fill",
    label: "on-bright",
    note: "ink on bright fills — rides --surface-2, the canvas color (inverted ink)",
  },
];

const SURFACE_RAMP: RampStep[] = [
  {
    token: "--code",
    label: "code well",
    note: "the one recessed tier (code is a well); collapses to the canvas in dark, stays a 92% grey in light",
  },
  { token: "--canvas", label: "canvas" },
  {
    token: "--sidebar-background",
    label: "frame",
    note: "sidebar chrome, lifted above the canvas; light gets a 98% tint while dark shares the raised tier with cards",
  },
  {
    token: "--card",
    label: "elevated",
    note: "card + modal share the tier; light alternates back to white (Carbon's light-layer model), dark joins the frame on the raised tier",
  },
  {
    token: "--popover",
    label: "popover",
    note: "top of the ladder — popovers outrank modals (menus open on top of dialogs)",
  },
  {
    token: "--muted",
    label: "muted fill",
    note: "level with the popover in dark; --secondary also rides it and is slated for retirement",
  },
  {
    token: "--hover",
    label: "hover / focus fill",
    note: "focus:bg-accent is the only focus cue in menus, so it steps clearly above the popover. --tertiary also rides it (slated for retirement), as does --muted-gray (chart grid, disabled badges).",
  },
];

const BORDER_RAMP: RampStep[] = [
  {
    token: "--border",
    label: "hairline",
    note: "the default edge on every surface tier",
  },
  {
    token: "--border-edge",
    label: "edge",
    note: "inputs + popover borders — dark lifts it above the hairline so the top layer keeps an edge on the near-black canvas; light coincides with the hairline",
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
    const onBright = token === "--text-on-bright";
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
            background: paint.color("--card"),
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
  const isPrimitive = PRIMITIVE_PATTERN.test(step.token);
  const riders = isPrimitive ? ridersOf(step.token) : [];
  const names = riders.length > 0 ? riders : [step.token];
  return (
    <div className={`${RAMP_GRID} items-center border-b py-2.5`}>
      <div className="flex min-w-0 flex-col gap-1">
        <Eyebrow>
          {index + 1} · {step.label}
        </Eyebrow>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {names.map((name) => (
            <span key={name} className="font-mono text-[11px] leading-4">
              <code className="text-foreground break-all">
                {UPCOMING_ROLES[name] ?? name}
              </code>
              {UPCOMING_ROLES[name] && (
                <span className="text-muted-foreground text-[10px]">
                  {" "}
                  ({name})
                </span>
              )}
            </span>
          ))}
        </div>
        <span className="text-muted-foreground font-mono text-[10px] leading-4">
          {isPrimitive
            ? `rides ${step.token}`
            : `light: ${lightCtx.decl(step.token) ?? "—"} · dark: ${darkCtx.decl(step.token) ?? "—"}`}
        </span>
        {step.note && (
          <span className="text-muted-foreground text-[11px] leading-4">
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
        style={{ color: paint.color("--primary") }}
      >
        Bright — titles, active states
      </span>
      <span className="text-sm" style={{ color: paint.color("--foreground") }}>
        Body — default copy sits one tier down.
      </span>
      <span
        className="text-xs"
        style={{ color: paint.color("--muted-foreground") }}
      >
        meta — captions and labels
      </span>
      <span
        className="text-xs"
        style={{ color: paint.color("--foreground-tertiary") }}
      >
        faint — placeholders and disabled
      </span>
    </div>
  );
}

/** The surface ladder nested the way the app stacks it, per mode. */
function SurfaceLadderSample({ paint }: { paint: TokenContext }) {
  const hairline = paint.color("--border");
  const label = { color: paint.color("--muted-foreground") };
  return (
    <div
      className="flex overflow-hidden rounded-md border font-mono text-[10px] leading-4"
      style={{
        background: paint.color("--sidebar-background"),
        borderColor: hairline,
      }}
    >
      <div
        className="w-14 shrink-0 p-2"
        style={{ color: paint.color("--sidebar-foreground") }}
      >
        frame
      </div>
      <div
        className="flex grow flex-col gap-1.5 border-l p-2"
        style={{
          background: paint.color("--background"),
          borderColor: hairline,
          ...label,
        }}
      >
        <span>canvas</span>
        <div
          className="rounded-sm border px-2 py-1"
          style={{
            background: paint.color("--surface-code"),
            borderColor: hairline,
            color: paint.color("--foreground"),
          }}
        >
          code well (recessed)
        </div>
        <div
          className="rounded-sm border p-2"
          style={{ background: paint.color("--card"), borderColor: hairline }}
        >
          <span style={label}>card / modal</span>
          <div
            className="mt-1.5 rounded-sm border p-1.5"
            style={{
              background: paint.color("--popover"),
              borderColor: paint.color("--popover-border"),
              color: paint.color("--popover-foreground"),
            }}
          >
            popover
            <div
              className="mt-1 rounded-sm px-1.5 py-0.5"
              style={{
                background: paint.color("--accent"),
                color: paint.color("--accent-foreground"),
              }}
            >
              hover / focus fill
            </div>
          </div>
        </div>
        <div
          className="rounded-sm px-2 py-1"
          style={{ background: paint.color("--muted"), ...label }}
        >
          muted fill
        </div>
      </div>
    </div>
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
          <Eyebrow>Step · tokens</Eyebrow>
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
      /^--(?:border|border-contrast|popover-border|input|ring)$/.test(n),
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
      /^--(?:background|foreground|foreground-tertiary|muted|surface-code(?:-header)?|popover|card|modal)(?:-foreground)?$/.test(
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
    blurb:
      "Button / hover / selection fills with their paired foregrounds. --secondary and --tertiary are slated for retirement.",
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
    title: "Neutral primitives",
    blurb:
      "The private :root/.dark ladder steps behind the ramps above. Components never reference these — use the semantic tokens.",
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
      <div className="text-muted-foreground flex min-w-0 flex-col gap-0.5 font-mono text-[10px] leading-4">
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
                style={{ background: alphaColor(ctx, "--muted", 0.5) }}
              >
                Hovered row
              </span>
            </div>
          }
        />
        <StateRow
          state="Selected · row"
          classes="data-[state=selected]:bg-muted"
          tokens="--muted"
          seenIn="TableRow (ui/table.tsx)"
          sample={
            <div
              className="flex flex-col rounded-md border text-xs"
              style={rowBase}
            >
              <span className="border-b px-2.5 py-1.5">Default row</span>
              <span
                className="px-2.5 py-1.5"
                style={{ background: color("--muted") }}
              >
                Selected row
              </span>
            </div>
          }
        />
        <StateRow
          state="Hover · item"
          classes="focus:bg-hover focus:text-on-hover / hover:bg-hover"
          tokens="--accent · --accent-foreground"
          seenIn="DropdownMenuItem, ghost & outline Button"
          sample={
            <div
              className="flex flex-col gap-0.5 rounded-md border p-1 text-xs"
              style={{ background: color("--popover") }}
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
          classes="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          tokens="--ring · ring-offset uses --background"
          seenIn="Button, Input, every focusable control"
          sample={
            <div
              className="rounded-md border px-2.5 py-1.5"
              style={{ background: color("--background") }}
            >
              <span
                className="inline-block rounded-md border px-2.5 py-0.5 text-xs"
                style={{
                  background: color("--card"),
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
        if (name === "--foreground" || name === "--foreground-tertiary")
          base = "--background";
        if (name === "--muted-foreground") base = "--muted";
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
      if (name === "--ring") {
        return (
          <div
            className="rounded-md border px-2.5 py-1.5"
            style={{ background: color("--background") }}
          >
            <span
              className="inline-block rounded-md border px-2.5 py-0.5 text-xs"
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
              style={{ background: color("--card") }}
            />
          </span>
        </div>
      );
    }
    case "mutedAccents": {
      return (
        <div
          className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
          style={{ background: color("--card") }}
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
          className="text-muted-foreground mt-1.5 size-4 shrink-0 transition-transform group-open:rotate-90"
        />
        <div className="flex flex-1 items-baseline justify-between gap-4">
          <div>
            <h2 className="text-foreground text-lg font-bold">
              Tailwind color mappings
            </h2>
            <p className="text-muted-foreground max-w-2xl text-sm">
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
              <span
                className="text-muted-foreground truncate"
                title={token.value}
              >
                {token.value}
              </span>
            </div>
          ))}
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
              <code className="font-mono">src/styles/globals.css</code>. The
              three neutral ramps up top show light and dark side by side —
              independent of the toolbar switcher — labeled with the role
              vocabulary (the underlying CSS variable in parentheses until the
              code migration lands) on each token. The tables below are the full
              token reference; the toolbar switcher previews their samples per
              theme.
            </>
          }
          meta={<>{colorEntryCount} color tokens · light and dark</>}
        />
        <RampSection
          title="Text ramp"
          blurb="Four tiers on the canvas — faint < meta < body < bright — plus the inverted ink for bright fills. Color carries state; weight never changes."
          steps={TEXT_RAMP}
          kind="text"
          renderModeSample={(paint) => <TextHierarchySample paint={paint} />}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <RampSection
          title="Background / surface ramp"
          blurb="The surface ladder in order: code well < canvas < sidebar frame < card + modal < popover < muted < hover. Light mostly alternates back to white inside a tinted frame; dark compresses to four levels — canvas < raised (frame + card/modal) < popover/muted < focus. Elevation is lightness steps plus hairlines, not shadows."
          steps={SURFACE_RAMP}
          kind="surface"
          renderModeSample={(paint) => <SurfaceLadderSample paint={paint} />}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
        />
        <RampSection
          title="Border / line ramp"
          blurb="Three line tiers, hairline to contrast. Light collapses the first two; dark spreads them so inputs and popovers keep an edge on the near-black canvas."
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
