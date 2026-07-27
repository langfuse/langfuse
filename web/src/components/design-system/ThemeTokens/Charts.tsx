/**
 * Storybook-only chart color reference (Design → Charts), modeled on Kumo's
 * chart-colors docs: the color systems split up front (categorical series vs
 * sequential scale), a numbered palette strip per system, and a small real
 * chart sample painting from the tokens.
 *
 * Every value is parsed at build time from `src/styles/globals.css` (see
 * parseThemeTokens.ts), so the page cannot drift from the stylesheet.
 * Samples repaint under the active Storybook theme (toolbar switcher).
 */
import {
  PageHeader,
  rootEntries,
  type TokenContext,
  type TokenEntry,
  TokenRow,
  TokenSection,
  useTokenContexts,
} from "./shared";

const seriesEntries = rootEntries
  .filter((entry) => /^--chart-\d+$/.test(entry.name))
  .sort(
    (a, b) =>
      Number(/\d+/.exec(a.name)?.[0] ?? 0) -
      Number(/\d+/.exec(b.name)?.[0] ?? 0),
  );
const gridEntry = rootEntries.find((entry) => entry.name === "--chart-grid");
const scaleEntries = rootEntries
  .filter((entry) => /^--color-\d+$/.test(entry.name))
  .sort(
    (a, b) =>
      Number(/\d+/.exec(a.name)?.[0] ?? 0) -
      Number(/\d+/.exec(b.name)?.[0] ?? 0),
  );

/** Numbered swatch strip (Kumo-style palette overview). */
function PaletteStrip({
  ctx,
  entries,
}: {
  ctx: TokenContext;
  entries: TokenEntry[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map((entry) => (
        <div key={entry.name} className="flex flex-col items-center gap-1">
          <span
            className="border-border-contrast h-8 w-12 rounded-sm border"
            style={{ background: ctx.color(entry.name) }}
          />
          <code className="text-muted-foreground font-mono text-[9px]">
            {/\d+/.exec(entry.name)?.[0]}
          </code>
        </div>
      ))}
    </div>
  );
}

/** One grouped bar chart painting every categorical series token. */
function SeriesBarsSample({ ctx }: { ctx: TokenContext }) {
  const heights = [0.85, 0.6, 0.72, 0.45, 0.65, 0.35, 0.55, 0.25];
  return (
    <div
      className="flex h-24 items-end gap-2 rounded-md border px-3 pt-3"
      style={{
        background: ctx.color("--card"),
        borderBottomColor: ctx.color("--chart-grid"),
      }}
    >
      {seriesEntries.map((entry, index) => (
        <div
          key={entry.name}
          className="flex-1 rounded-t-sm"
          style={{
            height: `${(heights[index % heights.length] ?? 0.5) * 100}%`,
            background: ctx.color(entry.name),
          }}
        />
      ))}
    </div>
  );
}

/** Per-token mini bars for the series rows. */
function ChartBarSample({ ctx, name }: { ctx: TokenContext; name: string }) {
  const index = Number(/\d+/.exec(name)?.[0] ?? 1);
  return (
    <div
      className="flex h-10 items-end gap-1 rounded-md border px-2.5 pt-1.5"
      style={{
        background: ctx.color("--background"),
        borderBottomColor: ctx.color("--chart-grid"),
      }}
    >
      {[0.9, 0.55, 0.75, 0.4].map((height, barIndex) => (
        <div
          key={barIndex}
          className="w-3 rounded-t-sm"
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

function GridLinesSample({ ctx }: { ctx: TokenContext }) {
  return (
    <div
      className="flex h-10 flex-col justify-between rounded-md border px-2.5 py-1.5"
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

/** Heatmap cells painting the sequential score scale. */
function HeatmapSample({ ctx }: { ctx: TokenContext }) {
  const steps = [1, 2, 4, 3, 5, 2, 1, 3, 5, 4, 2, 1, 4, 5, 3, 2];
  return (
    <div
      className="grid grid-cols-8 gap-1 rounded-md border p-2"
      style={{ background: ctx.color("--card") }}
    >
      {steps.map((step, index) => (
        <span
          key={index}
          className="h-5 rounded-sm"
          style={{ background: ctx.color(`--color-${step}`) }}
        />
      ))}
    </div>
  );
}

export function Charts() {
  const { ctx, lightCtx, darkCtx } = useTokenContexts();

  const rowProps = { ctx, lightCtx, darkCtx };

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
        <PageHeader
          eyebrow="Design tokens"
          title="Charts"
          lede={
            <>
              A categorical palette for series, a sequential scale for
              magnitude. Parsed at build time from{" "}
              <code className="font-mono">src/styles/globals.css</code>.
            </>
          }
          meta={
            <>
              {seriesEntries.length} series colors · {scaleEntries.length} scale
              steps · 1 grid color
            </>
          }
        />

        <TokenSection
          title="Categorical series"
          blurb="One color per nominal series (trace name, model, level); more series than colors cycle with modulo."
          count={seriesEntries.length}
          sectionSample={
            <div className="flex flex-col gap-3">
              <PaletteStrip ctx={ctx} entries={seriesEntries} />
              <SeriesBarsSample ctx={ctx} />
            </div>
          }
        >
          {seriesEntries.map((entry) => (
            <TokenRow
              key={entry.name}
              name={entry.name}
              entry={entry}
              {...rowProps}
              sample={<ChartBarSample ctx={ctx} name={entry.name} />}
            />
          ))}
        </TokenSection>

        <TokenSection
          title="Sequential scale"
          blurb="Five ordered steps encoding a single magnitude; used by the score heatmaps."
          count={scaleEntries.length}
          sectionSample={
            <div className="flex flex-col gap-3">
              <PaletteStrip ctx={ctx} entries={scaleEntries} />
              <HeatmapSample ctx={ctx} />
            </div>
          }
        >
          {scaleEntries.map((entry) => (
            <TokenRow
              key={entry.name}
              name={entry.name}
              entry={entry}
              {...rowProps}
              sample={
                <div
                  className="rounded-md border px-2.5 py-1.5"
                  style={{ background: ctx.color("--background") }}
                >
                  <span
                    className="inline-block h-4 w-14 rounded-sm"
                    style={{ background: ctx.color(entry.name) }}
                  />
                </div>
              }
            />
          ))}
        </TokenSection>

        {gridEntry && (
          <TokenSection
            title="Grid"
            blurb="Grid and axis lines; quiet so the series carry the contrast."
            count={1}
          >
            <TokenRow
              name={gridEntry.name}
              entry={gridEntry}
              {...rowProps}
              sample={<GridLinesSample ctx={ctx} />}
            />
          </TokenSection>
        )}
      </div>
    </div>
  );
}
