/**
 * Storybook-only color reference (Design → Color), modeled on Carbon's color
 * docs (interaction states) and Kumo's semantic-token tables (token rows
 * grouped by role, purpose-first blurbs). The surface layering model lives on
 * the Layout page.
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
          classes="focus:bg-accent focus:text-accent-foreground / hover:bg-accent"
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
              toolbar switcher previews light/dark.
            </>
          }
          meta={<>{colorEntryCount} color tokens · light and dark</>}
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
