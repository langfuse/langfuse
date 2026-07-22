import React from "react";
import preview from "../../../.storybook/preview";

/**
 * Design-system documentation: every color token declared in
 * `src/styles/globals.css` (`:root` + `.dark`), rendered live so the palette
 * can be scanned in both themes with the global Theme toolbar toggle.
 *
 * Swatches read the CSS variables at render time — `hsl(var(--token))` for the
 * HSL triplet tokens, `var(--color-N)` for the oklch heatmap scale — so they
 * resolve exactly like the app (the Storybook preview imports the same
 * globals.css and flips the `dark` class on <html>).
 */

/** A single color token rendered as a bordered block + its variable name. */
function Swatch({ token, css }: { token: string; css?: string }) {
  return (
    <div className="flex w-36 flex-col gap-1">
      <div
        className="border-border h-12 w-full rounded-md border"
        style={{ backgroundColor: css ?? `hsl(var(--${token}))` }}
      />
      <code className="text-muted-foreground font-mono text-[11px] leading-tight">
        --{token}
      </code>
    </div>
  );
}

/**
 * A background/foreground token pair rendered as a filled chip with text, so
 * the contrast of the pair is visible at a glance.
 */
function PairChip({
  bg,
  fg,
  label,
}: {
  bg: string;
  fg: string;
  label?: string;
}) {
  return (
    <div className="flex w-52 flex-col gap-1">
      <div
        className="border-border flex h-12 items-center justify-center rounded-md border px-2 text-sm font-bold"
        style={{
          backgroundColor: `hsl(var(--${bg}))`,
          color: `hsl(var(--${fg}))`,
        }}
      >
        {label ?? "Aa — sample text"}
      </div>
      <code className="text-muted-foreground font-mono text-[11px] leading-tight">
        --{bg} / --{fg}
      </code>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-foreground text-lg font-bold">{title}</h2>
      {note && <p className="text-muted-foreground mt-1 text-xs">{note}</p>}
      <div className="mt-3 flex flex-wrap gap-3">{children}</div>
    </section>
  );
}

const SEMANTIC_PAIRS = [
  "primary",
  "secondary",
  "tertiary",
  "accent",
  "destructive",
] as const;

const STATUS_PAIRS: { bg: string; fg: string }[] = [
  { bg: "light-red", fg: "dark-red" },
  { bg: "light-yellow", fg: "dark-yellow" },
  { bg: "light-green", fg: "dark-green" },
  { bg: "light-blue", fg: "dark-blue" },
  { bg: "accent-light-green", fg: "accent-dark-green" },
  { bg: "accent-light-blue", fg: "accent-dark-blue" },
];

const QLANG_TOKENS = [
  "qlang-field",
  "qlang-value",
  "qlang-number",
  "qlang-keyword",
] as const;

function ThemeTokensDoc() {
  return (
    <div className="text-foreground mx-auto max-w-5xl p-8 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Theme tokens</h1>
      <p className="text-muted-foreground mt-1">
        All color tokens from <code>globals.css</code>, resolved live. Flip the
        Theme toolbar toggle to compare light and dark.
      </p>

      <Section
        title="Surfaces"
        note="App surfaces and their foregrounds, plus the structural border/input/ring tokens."
      >
        <PairChip bg="background" fg="foreground" />
        <PairChip bg="card" fg="card-foreground" />
        <PairChip bg="popover" fg="popover-foreground" />
        <PairChip bg="header" fg="header-foreground" />
        <PairChip bg="muted" fg="muted-foreground" />
        <PairChip bg="background" fg="foreground-tertiary" label="faint text" />
        <Swatch token="border" />
        <Swatch token="border-contrast" />
        <Swatch token="input" />
        <Swatch token="ring" />
        <Swatch token="surface-code" />
      </Section>

      <Section
        title="Semantic"
        note="shadcn action colors — each pair rendered as a filled chip so contrast is scannable."
      >
        {SEMANTIC_PAIRS.map((name) => (
          <PairChip
            key={name}
            bg={name}
            fg={`${name}-foreground`}
            label={name}
          />
        ))}
      </Section>

      <Section
        title="Langfuse accents"
        note="Brand accent + the muted categorical set used across entity icons and charts."
      >
        <Swatch token="primary-accent" />
        <Swatch token="link" />
        <Swatch token="link-hover" />
        <Swatch token="control-fill" />
        <Swatch token="control-track" />
        <Swatch token="muted-blue" />
        <Swatch token="muted-green" />
        <Swatch token="muted-magenta" />
        <Swatch token="muted-gray" />
      </Section>

      <Section
        title="Status / accent pairs"
        note="light-* backgrounds with their dark-* foregrounds — the Badge success/error/warning recipe."
      >
        {STATUS_PAIRS.map(({ bg, fg }) => (
          <PairChip key={bg} bg={bg} fg={fg} label={bg.replace("light-", "")} />
        ))}
      </Section>

      <Section
        title="Search grammar (qlang)"
        note="Editor-style syntax theme for the search-bar filter grammar — deliberately its own palette."
      >
        {QLANG_TOKENS.map((token) => (
          <Swatch key={token} token={token} />
        ))}
        <div className="border-border bg-background flex h-12 items-center rounded-md border px-3 font-mono text-sm">
          <span style={{ color: "hsl(var(--qlang-field))" }}>level</span>
          <span className="text-muted-foreground">=</span>
          <span style={{ color: "hsl(var(--qlang-value))" }}>
            &quot;ERROR&quot;
          </span>
          <span style={{ color: "hsl(var(--qlang-keyword))" }}>
            &nbsp;and&nbsp;
          </span>
          <span style={{ color: "hsl(var(--qlang-field))" }}>latency</span>
          <span className="text-muted-foreground">&gt;</span>
          <span style={{ color: "hsl(var(--qlang-number))" }}>2</span>
        </div>
      </Section>

      <Section title="Sidebar">
        <PairChip bg="sidebar-background" fg="sidebar-foreground" />
        <PairChip bg="sidebar-primary" fg="sidebar-primary-foreground" />
        <PairChip bg="sidebar-accent" fg="sidebar-accent-foreground" />
        <Swatch token="sidebar-border" />
        <Swatch token="sidebar-ring" />
      </Section>

      <Section
        title="Find match"
        note="In-page text search highlights (all matches vs. the selected match)."
      >
        <PairChip bg="find-match-background" fg="foreground" label="match" />
        <PairChip
          bg="find-match-selected-background"
          fg="find-match-selected-foreground"
          label="selected match"
        />
      </Section>

      <Section
        title="Charts"
        note="Categorical chart series 1–8 plus the grid line color."
      >
        {Array.from({ length: 8 }, (_, i) => (
          <Swatch key={i} token={`chart-${i + 1}`} />
        ))}
        <Swatch token="chart-grid" />
      </Section>

      <Section
        title="Heatmap (oklch)"
        note="color-1..5 are full oklch values, read via var(--color-N) directly."
      >
        {Array.from({ length: 5 }, (_, i) => (
          <Swatch
            key={i}
            token={`color-${i + 1}`}
            css={`var(--color-${i + 1})`}
          />
        ))}
      </Section>

      <p className="text-muted-foreground mt-10 border-t pt-4 text-xs">
        Part of the design system. Tokens live in{" "}
        <code>src/styles/globals.css</code>; this page reads them live, so it
        can never drift from the app.
      </p>
    </div>
  );
}

const meta = preview.meta({
  title: "Design System/Theme Tokens",
  component: ThemeTokensDoc,
  parameters: { layout: "fullscreen" },
});

export const Overview = meta.story({});
