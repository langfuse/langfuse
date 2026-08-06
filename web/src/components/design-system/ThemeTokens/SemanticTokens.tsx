/**
 * Storybook-only reference (Design → Semantic tokens): the semantic layer of
 * the new token architecture, mapped onto the primitive palette (see the
 * Palette page). Nothing here is wired to `globals.css` — review only.
 */
import { type ReactNode } from "react";

import { DocsPageHeader, DocsSection } from "./docsChrome";
import { type Family, NEUTRAL, STEP_NAMES, STONE } from "./Palette";

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

export function SemanticTokens() {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <DocsPageHeader
          eyebrow="Design tokens · semantic"
          title="Semantic tokens"
        />
        <MappingSection
          title="Background / Fill / From / Via / To"
          blurb="Surface elevation, outermost first."
          tokens={BG_ELEVATION}
        />
      </div>
    </div>
  );
}
