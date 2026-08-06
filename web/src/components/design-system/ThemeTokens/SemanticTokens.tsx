/**
 * Storybook-only reference (Design → Semantic tokens): the semantic layer of
 * the new token architecture, mapped onto the primitive palette (see the
 * Palette page). The tokens live as css vars in `globals.css`; this page is
 * the human-readable map.
 */
import { Sparkles } from "lucide-react";
import { type ReactNode } from "react";

import { DocsPageHeader, DocsSection } from "./docsChrome";
import { type Family, NEUTRAL, RED, STEP_NAMES, STONE } from "./Palette";

/** Primitive reference: family step (or white), with its resolvable value. */
type PrimitiveRef = { label: string; raw: string };

const ref = (
  family: Family,
  step: (typeof STEP_NAMES)[number],
): PrimitiveRef => ({
  label: `${family.name}-${step}`,
  raw: family.steps[STEP_NAMES.indexOf(step)],
});

const WHITE: PrimitiveRef = { label: "white", raw: "100% 0 0" };

type SemanticToken = {
  token: string;
  purpose: string;
  light: PrimitiveRef;
  dark: PrimitiveRef;
};

const BG_ELEVATION: SemanticToken[] = [
  {
    token: "--bg-elevation-1",
    purpose: "Page canvas",
    light: WHITE,
    dark: ref(STONE, "950"),
  },
  {
    token: "--bg-elevation-2",
    purpose: "Cards, panels, nav, dialogs",
    light: ref(NEUTRAL, "50"),
    dark: ref(STONE, "900"),
  },
  {
    token: "--bg-elevation-3",
    purpose: "Popovers, menus, quiet fills",
    light: ref(NEUTRAL, "100"),
    dark: ref(STONE, "800"),
  },
  {
    token: "--bg-elevation-4",
    purpose: "Hover, selected",
    light: ref(NEUTRAL, "200"),
    dark: ref(STONE, "700"),
  },
  {
    token: "--bg-inverse",
    purpose: "Ink-solid fill: primary buttons",
    light: ref(NEUTRAL, "900"),
    dark: ref(STONE, "100"),
  },
];

const BORDER: SemanticToken[] = [
  {
    token: "--border-default",
    purpose: "Default hairline across the app",
    light: ref(NEUTRAL, "200"),
    dark: ref(STONE, "700"),
  },
  {
    token: "--border-faint",
    purpose: "Side nav, side panels, dashboard widgets, cards",
    light: ref(NEUTRAL, "100"),
    dark: ref(STONE, "900"),
  },
  {
    token: "--border-contrast",
    purpose: "Assertive lines: inputs, outline buttons",
    light: ref(NEUTRAL, "400"),
    dark: ref(STONE, "600"),
  },
];

const TEXT: SemanticToken[] = [
  {
    token: "--text-primary",
    purpose: "Most of the text on the screen",
    light: ref(NEUTRAL, "800"),
    dark: ref(STONE, "200"),
  },
  {
    token: "--text-secondary",
    purpose: "Description, tags, metadata etc.",
    light: ref(NEUTRAL, "600"),
    dark: ref(STONE, "400"),
  },
  {
    token: "--text-tertiary",
    purpose: "Disabled, muted",
    light: ref(NEUTRAL, "500"),
    dark: ref(STONE, "500"),
  },
  {
    token: "--text-contrast",
    purpose: "Titles or things that need to call out attention (use rarely)",
    light: ref(NEUTRAL, "950"),
    dark: ref(STONE, "50"),
  },
  {
    token: "--text-on-inverse",
    purpose: "Ink on the inverse fill",
    light: ref(NEUTRAL, "100"),
    dark: ref(STONE, "900"),
  },
];

function RefCell({ reference }: { reference: PrimitiveRef }) {
  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      title={`oklch(${reference.raw})`}
    >
      <span
        aria-hidden
        className="border-border-contrast size-3 shrink-0 rounded-sm border"
        style={{ background: `oklch(${reference.raw})` }}
      />
      <code
        className="text-muted-foreground truncate font-mono text-[11px]"
        title={reference.label}
      >
        {reference.label}
      </code>
    </div>
  );
}

const MAPPING_GRID =
  "grid grid-cols-[minmax(150px,auto)_minmax(160px,1fr)_minmax(120px,160px)_minmax(120px,160px)] items-center gap-x-4";

function MappingSection({
  title,
  blurb,
  tokens,
}: {
  title: string;
  blurb: ReactNode;
  tokens: SemanticToken[];
}) {
  return (
    <DocsSection title={title} blurb={blurb}>
      <div className="flex flex-col">
        <div className={`${MAPPING_GRID} border-b pb-1.5`}>
          {["Token", "Usage", "Light", "Dark"].map((label) => (
            <span
              key={label}
              className="text-muted-foreground font-mono text-[10px] tracking-[0.05em] uppercase"
            >
              {label}
            </span>
          ))}
        </div>
        {tokens.map((entry) => (
          <div key={entry.token} className={`${MAPPING_GRID} border-b py-2`}>
            <code className="text-foreground font-mono text-[11px]">
              {entry.token}
            </code>
            <span className="text-muted-foreground text-sm">
              {entry.purpose}
            </span>
            <RefCell reference={entry.light} />
            <RefCell reference={entry.dark} />
          </div>
        ))}
      </div>
    </DocsSection>
  );
}

const STATUS: SemanticToken[] = [
  {
    token: "--status-error-fill",
    purpose: "Destructive fill: hovered danger buttons",
    light: ref(RED, "800"),
    dark: ref(RED, "400"),
  },
  {
    token: "--status-error-text",
    purpose: "Danger text and icons",
    light: ref(RED, "700"),
    dark: ref(RED, "400"),
  },
];

const ICON_SIZES = [
  {
    token: "--icon-size-md",
    value: "0.75rem",
    pixels: "12px",
    purpose: "Default icon size: buttons, inline icons",
  },
];

const SHADOWS = [
  {
    token: "--shadow-1",
    purpose: "Soft double shadow on primary and secondary buttons",
    value: "0 4px 8px oklch(0 0 0 / 0.05), 0 4px 4px oklch(0 0 0 / 0.03)",
  },
];

function ShadowSection() {
  return (
    <DocsSection title="Shadow" blurb="Elevation shadows.">
      <div className="flex flex-col">
        <div className={`${MAPPING_GRID} border-b pb-1.5`}>
          {["Token", "Usage", "Value", "Sample"].map((label) => (
            <span
              key={label}
              className="text-muted-foreground font-mono text-[10px] tracking-[0.05em] uppercase"
            >
              {label}
            </span>
          ))}
        </div>
        {SHADOWS.map((entry) => (
          <div key={entry.token} className={`${MAPPING_GRID} border-b py-2`}>
            <code className="text-foreground font-mono text-[11px]">
              {entry.token}
            </code>
            <span className="text-muted-foreground text-sm">
              {entry.purpose}
            </span>
            <code
              className="text-muted-foreground truncate font-mono text-[11px]"
              title={entry.value}
            >
              {entry.value}
            </code>
            <span
              aria-hidden
              className="h-8 w-16 rounded-[2px] border border-[var(--border-default)] bg-[var(--bg-elevation-1)]"
              style={{ boxShadow: `var(${entry.token})` }}
            />
          </div>
        ))}
      </div>
    </DocsSection>
  );
}

function IconSizeSection() {
  return (
    <DocsSection title="Icon" blurb="Icon sizing.">
      <div className="flex flex-col">
        <div className={`${MAPPING_GRID} border-b pb-1.5`}>
          {["Token", "Usage", "Size", "Sample"].map((label) => (
            <span
              key={label}
              className="text-muted-foreground font-mono text-[10px] tracking-[0.05em] uppercase"
            >
              {label}
            </span>
          ))}
        </div>
        {ICON_SIZES.map((entry) => (
          <div key={entry.token} className={`${MAPPING_GRID} border-b py-2`}>
            <code className="text-foreground font-mono text-[11px]">
              {entry.token}
            </code>
            <span className="text-muted-foreground text-sm">
              {entry.purpose}
            </span>
            <code className="text-muted-foreground font-mono text-[11px]">
              {entry.value} · {entry.pixels}
            </code>
            <Sparkles
              aria-hidden
              className="text-foreground"
              style={{
                width: `var(${entry.token})`,
                height: `var(${entry.token})`,
              }}
            />
          </div>
        ))}
      </div>
    </DocsSection>
  );
}

export function SemanticTokens() {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <DocsPageHeader
          eyebrow="Design tokens · semantic"
          title="Semantic tokens"
          lede={
            <span className="flex flex-col gap-1">
              <span>
                1. Components consume semantic tokens only, never primitives.
              </span>
              <span>
                2. Every token carries a light and a dark value. Themes flip
                inside the token, so components never use dark: color overrides.
              </span>
              <span>
                3. Primitives live on the Palette page; this page is the map
                from role to primitive, per mode.
              </span>
            </span>
          }
        />
        <MappingSection
          title="Background / Fill / From / Via / To"
          blurb="Surface elevation, outermost first."
          tokens={BG_ELEVATION}
        />
        <MappingSection
          title="Border / Divide / Outline / Stroke"
          blurb="Lines and strokes."
          tokens={BORDER}
        />
        <MappingSection
          title="Text / Placeholder"
          blurb="Text tiers, brightest last."
          tokens={TEXT}
        />
        <MappingSection
          title="Status"
          blurb="Destructive intent."
          tokens={STATUS}
        />
        <ShadowSection />
        <IconSizeSection />
      </div>
    </div>
  );
}
