/**
 * Storybook-only typography reference (Design → Typography),
 * modeled on Carbon's typography docs: single-sentence typeface specimens
 * with both weight roles inline, a live type-scale table, and tokenized
 * usage guidance.
 *
 * Every value on this page — font stacks, the two weight roles, the text-*
 * size tokens and their canonical weights — is parsed at build time from
 * `src/styles/globals.css` (see parseThemeTokens.ts), so the page cannot
 * drift from the stylesheet.
 */
import {
  resolveDeclaredValue,
  type TokenDeclaration,
} from "./parseThemeTokens";
import {
  Eyebrow,
  InlineCode,
  PageHeader,
  PageSection,
  Panel,
  parsed,
} from "./shared";

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

/** First family in the (var-resolved) stack, e.g. `Inter` or `ui-monospace`. */
const familyName = (token: TokenDeclaration) =>
  resolveStatic(token.value).split(",")[0].trim().replace(/^"|"$/g, "");

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

/** One compact scale row: specimen · token · size · usage citation. */
function TypeScaleRow({ token }: { token: TokenDeclaration }) {
  const weightToken = weightTokenFor(token.name);
  const weightValue = weightToken
    ? resolveStatic(weightToken.value)
    : undefined;
  const declaredPx = parseFloat(token.value) * 16;
  const usage = SIZE_USAGE[token.name];

  return (
    <div className="grid items-center gap-x-8 gap-y-1 border-t py-3 md:grid-cols-[minmax(0,1fr)_130px_130px_minmax(0,1fr)]">
      <div className="min-w-0 overflow-hidden">
        <span
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
      <div className="flex flex-wrap items-center gap-2">
        <InlineCode>{token.name.replace(/^--/, "")}</InlineCode>
      </div>
      <div className="text-muted-foreground font-mono text-[11px] leading-4">
        {token.value} / {formatPx(declaredPx)}
      </div>
      <div className="min-w-0 font-mono text-[11px] leading-4">
        {usage ? (
          <span className="text-foreground">used in · {usage}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

/** Typeface specimen: one real sentence with both weight roles inline. */
function TypefaceSpecimen({
  token,
  role,
}: {
  token: TokenDeclaration;
  role: string;
}) {
  // Render through the emitted :root var — live truth, same source token.
  const fontFamily = `var(${token.name})`;
  const stackCaption = `${token.name}: ${token.value}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Panel>
        <div className="flex items-start gap-2 border-b px-4 py-3">
          <Eyebrow>{role}</Eyebrow>
        </div>
        <div
          className="flex grow flex-col gap-3 px-4 py-5"
          style={{ fontFamily }}
        >
          <span className="text-foreground text-3xl font-bold">
            {familyName(token)}
          </span>
          <p
            className="text-foreground text-lg"
            style={{ fontWeight: Number(regularWeight) }}
          >
            Trace every span at regular {regularWeight},{" "}
            <span style={{ fontWeight: Number(boldWeight) }}>
              score every generation at bold {boldWeight}.
            </span>
          </p>
        </div>
      </Panel>
      <code
        className="text-muted-foreground truncate font-mono text-[10px] leading-4"
        title={stackCaption}
      >
        {stackCaption}
      </code>
    </div>
  );
}

/** Weight-role row: the same sentence at the role's live weight. */
function WeightRoleRow({ token }: { token: TokenDeclaration }) {
  const role = token.name.replace("--font-weight-", "");
  return (
    <div className="grid items-center gap-x-8 gap-y-1 border-t py-3 md:grid-cols-[minmax(0,1fr)_260px]">
      <span
        className="text-foreground block truncate text-xl"
        title="The quick brown fox jumps over the lazy dog"
        style={{ fontWeight: Number(token.value) }}
      >
        The quick brown fox jumps over the lazy dog
      </span>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] leading-4">
        <span>
          {token.name}: {token.value}
        </span>
        <span>
          {role === "bold" ? "· the font-bold utility" : "· every text-* size"}
        </span>
      </div>
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
        <PageHeader
          eyebrow="Design tokens"
          title="Typography"
          lede={
            <>
              Two typefaces, two weights, {sizeTokens.length} sizes. Parsed at
              build time from{" "}
              <code className="font-mono">src/styles/globals.css</code>.
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

        <PageSection
          title="Typefaces"
          blurb="Sans carries the interface; mono carries everything data-shaped."
          aside={<InlineCode>@theme static</InlineCode>}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {sansToken && (
              <TypefaceSpecimen
                token={sansToken}
                role="sans · UI text & body copy"
              />
            )}
            {monoToken && (
              <TypefaceSpecimen
                token={monoToken}
                role="mono · numerals, IDs, code, eyebrows"
              />
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            No third face: display text is the sans stack at a larger size.
          </p>
        </PageSection>

        <PageSection
          title="Weight roles"
          blurb="Two roles: regular and bold. Components never hardcode weight numbers."
          aside={<InlineCode>{weightTokens.length} roles</InlineCode>}
        >
          <div className="flex flex-col">
            {weightTokens.map((token) => (
              <WeightRoleRow key={token.name} token={token} />
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            <InlineCode>font-medium</InlineCode>,{" "}
            <InlineCode>font-semibold</InlineCode> and raw numbers are drift.
          </p>
        </PageSection>

        <PageSection
          title="Type scale"
          blurb="Each size carries its canonical weight. No line-height; opt in with leading-*."
          aside={<InlineCode>{sizeTokens.length} sizes</InlineCode>}
        >
          <div className="flex flex-col">
            {sizeTokens.map((token) => (
              <TypeScaleRow key={token.name} token={token} />
            ))}
          </div>
        </PageSection>

        <PageSection
          title="Mono conventions"
          blurb="Numerals, IDs, code and eyebrow labels are always mono. Samples use the exact app classes."
          aside={<InlineCode>--font-mono</InlineCode>}
        >
          <div className="flex flex-col">
            {MONO_EXAMPLES.map((example) => (
              <div
                key={example.label}
                className="grid items-center gap-x-8 gap-y-1 border-t py-3 md:grid-cols-[140px_minmax(0,1fr)_minmax(0,1.2fr)]"
              >
                <Eyebrow>{example.label}</Eyebrow>
                <div className="bg-card min-w-0 rounded-md border px-3 py-2">
                  <span className={`${example.className} block truncate`}>
                    {example.sample}
                  </span>
                </div>
                <div className="text-muted-foreground flex min-w-0 flex-col gap-0.5 font-mono text-[10px] leading-4">
                  <span className="break-all">{example.className}</span>
                  <span>as in · {example.seenIn}</span>
                </div>
              </div>
            ))}
          </div>
        </PageSection>
      </div>
    </div>
  );
}
