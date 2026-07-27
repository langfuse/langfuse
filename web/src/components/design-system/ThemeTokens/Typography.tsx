/**
 * Storybook-only typography reference (Design → Theme Tokens → Typography),
 * modeled on Carbon's typography docs: typeface specimens with character sets
 * and weights, a live type-scale table with per-style metadata, and tokenized
 * usage guidance.
 *
 * Every value on this page — font stacks, the two weight roles, the text-*
 * size tokens and their canonical weights — is parsed at build time from
 * `src/styles/globals.css` (see parseThemeTokens.ts), so the page cannot
 * drift from the stylesheet. Tokens whose declaration carries a
 * `PROPOSED (review)` comment get the same PROPOSED badge as the token
 * gallery. Rendered sizes/line boxes are measured live off the DOM.
 */
import { useCallback, useState } from "react";

import globalsCss from "../../../styles/globals.css?raw";
import {
  CropFrame,
  DocsPageHeader,
  DocsSection,
  Eyebrow,
  ProposedBadge,
  SpecChip,
} from "./docsChrome";
import {
  parseThemeTokens,
  resolveDeclaredValue,
  type TokenDeclaration,
} from "./parseThemeTokens";

const parsed = parseThemeTokens(globalsCss);

/** `@theme static` values (font stacks + weight roles) by token name. */
const staticTokens = new Map(
  parsed.fontTokens.map((token) => [token.name, token.value]),
);
const resolveStatic = (value: string) =>
  resolveDeclaredValue(value, staticTokens);

const sansToken = parsed.fontTokens.find((t) => t.name === "--font-sans");
const monoToken = parsed.fontTokens.find((t) => t.name === "--font-mono");
const weightTokens = parsed.fontTokens.filter((t) =>
  t.name.startsWith("--font-weight-"),
);
const regularWeight = resolveStatic("var(--font-weight-regular)");
const boldWeight = resolveStatic("var(--font-weight-bold)");

/** `--text-xs`, `--text-sm`, … (their `--font-weight` companions excluded). */
const sizeTokens = parsed.inlineTokens
  .filter((t) => /^--text-[a-z0-9]+$/.test(t.name))
  .sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

const weightTokenFor = (sizeName: string) =>
  parsed.inlineTokens.find((t) => t.name === `${sizeName}--font-weight`);

/** First quoted family in the stack, e.g. `"Inter"` — the webfont's name. */
const familyName = (token: TokenDeclaration) =>
  /"([^"]+)"/.exec(token.value)?.[1] ?? token.name;

const formatPx = (px: number) => `${Number(px.toFixed(2))}px`;

/**
 * Real usages in `web/src` (grepped, not guessed) — component names cited so
 * the scale table reads like Carbon's "used for …" guidance but stays honest.
 */
const SIZE_USAGE: Record<string, string> = {
  "--text-xs": "Badge · DataTable cells",
  "--text-sm": "Button · Input · DropdownMenu",
  "--text-base": "support-chat intro · eval template detail",
  "--text-lg": "PageHeader title · OverviewPanel title",
  "--text-xl": "DialogTitle",
  "--text-2xl": "CardTitle · splash screen heading",
  "--text-3xl": "TotalMetric · BigNumber widget",
};

const SAMPLE_LINE = "Trace every span, score every generation.";

const CHARACTER_SET_LINES = [
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789 0O 1lI ({}[]) => !== · $€% @&*",
];

/** One Carbon-style scale row: live specimen left, mono spec column right. */
function TypeScaleRow({ token }: { token: TokenDeclaration }) {
  const weightToken = weightTokenFor(token.name);
  const weightValue = weightToken
    ? resolveStatic(weightToken.value)
    : undefined;
  const weightRole = weightToken
    ? (/--font-weight-(\w+)/.exec(weightToken.value)?.[1] ?? weightToken.value)
    : undefined;
  const declaredPx = parseFloat(token.value) * 16;
  const usage = SIZE_USAGE[token.name];

  const [lineBox, setLineBox] = useState<number | null>(null);
  const measure = useCallback((element: HTMLSpanElement | null) => {
    if (!element) return;
    const height = element.getBoundingClientRect().height;
    setLineBox((previous) => (previous === height ? previous : height));
  }, []);

  return (
    <div className="grid gap-x-8 gap-y-2 border-t py-5 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 self-center overflow-hidden">
        <span
          ref={measure}
          title={SAMPLE_LINE}
          className="text-foreground block truncate"
          style={{
            fontSize: token.value,
            fontWeight: weightValue ? Number(weightValue) : undefined,
          }}
        >
          {SAMPLE_LINE}
        </span>
      </div>
      <div className="text-muted-foreground flex flex-col gap-1 font-mono text-[11px] leading-4">
        <div className="flex items-center gap-2">
          <SpecChip>{token.name.replace(/^--/, "")}</SpecChip>
          {token.proposed && <ProposedBadge />}
        </div>
        <div className="break-all">
          {token.name}: {token.value}
        </div>
        <div>
          size · {token.value} / {formatPx(declaredPx)}
        </div>
        <div>
          line box · {lineBox === null ? "—" : formatPx(lineBox)} (measured)
        </div>
        {weightRole && (
          <div>
            weight · {weightRole} ({weightValue})
          </div>
        )}
        {usage && <div className="text-foreground">used in · {usage}</div>}
      </div>
    </div>
  );
}

/** Carbon-style typeface specimen: character set, both weight roles, stack. */
function TypefaceSpecimen({
  token,
  role,
  guidance,
}: {
  token: TokenDeclaration;
  role: string;
  guidance: string;
}) {
  // Render through the emitted :root var — live truth, same source token.
  const fontFamily = `var(${token.name})`;
  return (
    <CropFrame>
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <Eyebrow>{role}</Eyebrow>
        {token.proposed && <ProposedBadge />}
      </div>
      <div
        className="flex grow flex-col gap-4 px-4 py-5"
        style={{ fontFamily }}
      >
        <span className="text-foreground text-3xl font-bold">
          {familyName(token)}
        </span>
        <div className="text-foreground flex flex-col gap-0.5 text-sm">
          {CHARACTER_SET_LINES.map((line) => (
            <span key={line} title={line} className="truncate">
              {line}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-0.5 text-lg">
          <span
            className="text-foreground"
            style={{ fontWeight: Number(regularWeight) }}
          >
            Regular — {regularWeight}
          </span>
          <span
            className="text-foreground"
            style={{ fontWeight: Number(boldWeight) }}
          >
            Bold — {boldWeight}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">{guidance}</p>
      </div>
      <div className="bg-surface-code flex flex-col gap-1 border-t px-4 py-3">
        <code className="text-foreground font-mono text-[11px] leading-4 break-all">
          {token.name}: {token.value}
        </code>
        {token.proposed?.note && (
          <span className="text-muted-foreground font-mono text-[10px] leading-4">
            {token.proposed.note}
          </span>
        )}
      </div>
    </CropFrame>
  );
}

/** Weight-role card: the same sentence at the role's live weight. */
function WeightRoleCard({ token }: { token: TokenDeclaration }) {
  const role = token.name.replace("--font-weight-", "");
  return (
    <div className="bg-card flex flex-col gap-2 rounded-md border p-4">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>{role} role</Eyebrow>
        {token.proposed && <ProposedBadge />}
      </div>
      <span
        className="text-foreground text-2xl"
        style={{ fontWeight: Number(token.value) }}
      >
        The quick brown fox jumps over the lazy dog
      </span>
      <span className="text-muted-foreground font-mono text-[11px] leading-4">
        {token.name}: {token.value}
        {role === "bold" ? " · the font-bold utility" : " · every text-* size"}
      </span>
    </div>
  );
}

/** Mono conventions, each rendered with the exact classes the app uses. */
const MONO_EXAMPLES: Array<{
  label: string;
  className: string;
  sample: string;
  seenIn: string;
}> = [
  {
    label: "Eyebrow label",
    className:
      "font-mono text-[10px] tracking-[0.05em] uppercase text-muted-foreground",
    sample: "Production · EU region",
    seenIn: "EnvLabelBadge, section eyebrows on this page",
  },
  {
    label: "Metric",
    className: "font-mono text-sm tabular-nums text-foreground",
    sample: "1,284 ms · 8,192 tok · $0.0042",
    seenIn: "chart tooltips, ExperimentPeekFooter",
  },
  {
    label: "Identifier",
    className: "font-mono text-[11px] text-muted-foreground",
    sample: "trace 7f3a9c2e-41d0-4b8a-9a71",
    seenIn: "ModernSession header, TraceEventsRow",
  },
  {
    label: "Code line",
    className: "font-mono text-xs text-foreground",
    sample: '{ "model": "gpt-5", "stream": true }',
    seenIn: "SessionObservationIO, Codeblock",
  },
];

export function Typography() {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <DocsPageHeader
          eyebrow="Design tokens"
          title="Typography"
          lede={
            <>
              Two typefaces, two weights, {sizeTokens.length} sizes. Parsed at
              build time from{" "}
              <code className="font-mono">src/styles/globals.css</code> — this
              page cannot drift from the stylesheet. Values marked{" "}
              <ProposedBadge /> carry a{" "}
              <code className="font-mono">PROPOSED (review)</code> comment
              there.
            </>
          }
          meta={
            <>
              {sansToken && `--font-sans "${familyName(sansToken)}"`}
              {monoToken && ` · --font-mono "${familyName(monoToken)}"`}
              {` · ${weightTokens.length} weight roles · ${sizeTokens.length} text-* sizes`}
            </>
          }
        />

        <DocsSection
          title="Typefaces"
          blurb="Inter carries the interface; Geist Mono carries everything data-shaped. Both load via next/font and stay behind font-relative tokens, so a face swap is a var swap."
          aside={<SpecChip>@theme static</SpecChip>}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {sansToken && (
              <TypefaceSpecimen
                token={sansToken}
                role="sans · UI text & body copy"
                guidance="Everything the user reads: labels, body copy, headings. Every text-* size renders in this face by default."
              />
            )}
            {monoToken && (
              <TypefaceSpecimen
                token={monoToken}
                role="mono · numerals, IDs, code, eyebrows"
                guidance="Everything data-shaped: numerals, identifiers, code, eyebrow labels. See the mono conventions below."
              />
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            There is deliberately no third face: the handoff&apos;s display font
            (F37 Analog) is commercial and is not shipped — display text falls
            back to the sans stack (see{" "}
            <code className="font-mono">src/styles/fonts.ts</code>).
          </p>
        </DocsSection>

        <DocsSection
          title="Two weights, deliberately"
          blurb="Exactly two weight roles exist: regular and bold. Both are font-relative tokens, so components never hardcode numbers — swapping the typeface only retunes the two role values."
          aside={<SpecChip>{weightTokens.length} roles</SpecChip>}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {weightTokens.map((token) => (
              <WeightRoleCard key={token.name} token={token} />
            ))}
          </div>
          <ul className="text-muted-foreground flex flex-col gap-1.5 text-sm">
            <li>
              <SpecChip>font-bold</SpecChip> is the bold role — the token
              deliberately overrides Tailwind&apos;s built-in 700.
            </li>
            <li>
              Every <SpecChip>text-*</SpecChip> size already carries the regular
              weight; heavier text opts in via <SpecChip>font-bold</SpecChip> or
              not at all.
            </li>
            <li>
              <SpecChip>font-medium</SpecChip>,{" "}
              <SpecChip>font-semibold</SpecChip> and raw numbers are drift —
              there is no in-between tier.
            </li>
          </ul>
        </DocsSection>

        <DocsSection
          title="Type scale"
          blurb="Each size token carries its canonical weight, so a text-* utility alone yields a complete style. Sizes declare no line-height — the line box below is measured live; leading-* utilities opt in per context."
          aside={<SpecChip>{sizeTokens.length} sizes</SpecChip>}
        >
          <div className="flex flex-col">
            {sizeTokens.map((token) => (
              <TypeScaleRow key={token.name} token={token} />
            ))}
          </div>
        </DocsSection>

        <DocsSection
          title="Mono conventions"
          blurb="The rule from the sessions handoff (documented in src/styles/fonts.ts): numerals, IDs, code and eyebrow labels are always mono. Each sample below renders with the exact classes the app uses."
          aside={<SpecChip>--font-mono</SpecChip>}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {MONO_EXAMPLES.map((example) => (
              <div
                key={example.label}
                className="bg-card flex flex-col gap-3 rounded-md border p-4"
              >
                <Eyebrow>{example.label}</Eyebrow>
                <div className="bg-background rounded-md border px-3 py-2.5">
                  <span className={example.className}>{example.sample}</span>
                </div>
                <div className="text-muted-foreground flex flex-col gap-1 font-mono text-[10px] leading-4">
                  <span className="break-all">{example.className}</span>
                  <span>as in · {example.seenIn}</span>
                </div>
              </div>
            ))}
          </div>
        </DocsSection>
      </div>
    </div>
  );
}
