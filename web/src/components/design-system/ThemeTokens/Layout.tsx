/**
 * Storybook-only layout reference (Design → Layout): the radius system, the
 * banner offset system used by fixed/sticky positioning, the surface layering
 * model, the app's overlay layer order, animation tokens, and the breakpoint
 * conventions.
 *
 * Token values are parsed at build time from `src/styles/globals.css` (see
 * parseThemeTokens.ts), so the page cannot drift from the stylesheet. The
 * layer order is read from its source of truth, `components/ui/layer.tsx`.
 *
 * Every section is a standalone component on purpose, so it can fold into
 * another reference page cheaply if this page is ever dissolved.
 */
import { type CSSProperties } from "react";

import { LAYER_ORDER } from "@/src/components/ui/layer";

import {
  CollapsedSection,
  Eyebrow,
  InlineCode,
  PageHeader,
  PageSection,
  parsed,
  rootEntries,
  type TokenContext,
  TokenRow,
  TokenSection,
  useTokenContexts,
} from "./shared";

const radiusEntry = rootEntries.find((entry) => entry.name === "--radius");
const inlineRadii = parsed.inlineTokens.filter((t) =>
  /^--radius-/.test(t.name),
);
const bannerEntries = rootEntries.filter((entry) =>
  entry.name.startsWith("--banner-"),
);
const spacingTokens = parsed.inlineTokens.filter((t) =>
  t.name.startsWith("--spacing-"),
);
const animationTokens = parsed.inlineTokens.filter((t) =>
  t.name.startsWith("--animate-"),
);

type RowContexts = {
  ctx: TokenContext;
  lightCtx: TokenContext;
  darkCtx: TokenContext;
};

function RadiusSample({
  ctx,
  radius,
}: {
  ctx: TokenContext;
  radius: string | undefined;
}) {
  return (
    <div
      className="rounded-md border px-2.5 py-1.5"
      style={{ background: ctx.color("--background") }}
    >
      <div
        className="h-7 w-16 border"
        style={{
          background: ctx.color("--muted"),
          borderColor: ctx.color("--border-contrast"),
          borderRadius: radius,
        }}
      />
    </div>
  );
}

/** The radius scale: one base token, derived sm / md / lg steps. */
export function RadiiSection({ ctx, lightCtx, darkCtx }: RowContexts) {
  const count = (radiusEntry ? 1 : 0) + inlineRadii.length;
  return (
    <TokenSection
      title="Radii"
      blurb="One base radius; the sm / md / lg steps derive from it."
      count={count}
    >
      {radiusEntry && (
        <TokenRow
          name={radiusEntry.name}
          entry={radiusEntry}
          ctx={ctx}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
          sample={<RadiusSample ctx={ctx} radius={ctx.decl("--radius")} />}
        />
      )}
      {inlineRadii.map((token) => (
        <TokenRow
          key={token.name}
          name={token.name}
          staticDecl={token}
          ctx={ctx}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
          sample={<RadiusSample ctx={ctx} radius={ctx.resolve(token.value)} />}
        />
      ))}
    </TokenSection>
  );
}

/** Mini viewport: banner strip on top, app content filling the remainder. */
function BannerSystemSample({ ctx }: { ctx: TokenContext }) {
  return (
    <div
      className="flex h-36 w-full max-w-sm flex-col overflow-hidden rounded-md border"
      style={{ background: ctx.color("--background") }}
    >
      <div
        className="flex items-center justify-center border-b px-2 py-1"
        style={{
          background: ctx.color("--light-yellow"),
          color: ctx.color("--dark-yellow"),
        }}
      >
        <span className="font-mono text-[10px]">
          banner · height = --banner-height
        </span>
      </div>
      <div className="flex grow flex-col gap-1 p-2">
        <span className="text-muted-foreground font-mono text-[10px]">
          app content · height = --spacing-screen-with-banner
        </span>
        <span className="text-muted-foreground font-mono text-[10px]">
          sticky/fixed elements offset by --banner-offset
        </span>
        <div
          className="mt-1 grow rounded-sm border"
          style={{ background: ctx.color("--card") }}
        />
      </div>
    </div>
  );
}

/** The banner offset system used by fixed/sticky positioning. */
export function LayoutOffsetsSection({ ctx, lightCtx, darkCtx }: RowContexts) {
  const count = bannerEntries.length + spacingTokens.length;
  return (
    <TokenSection
      title="Layout offsets"
      blurb="A banner raises --banner-height; everything below offsets by --banner-offset; full-height layouts use screen-with-banner, not 100svh."
      count={count}
      sectionSample={<BannerSystemSample ctx={ctx} />}
    >
      {bannerEntries.map((entry) => (
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
      {spacingTokens.map((token) => (
        <TokenRow
          key={token.name}
          name={token.name}
          staticDecl={token}
          ctx={ctx}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
          sample={null}
        />
      ))}
    </TokenSection>
  );
}

/* ------------------------------------------------------------------------- *
 * Layering model (Carbon-style): the surface ladder, both themes at once.
 * ------------------------------------------------------------------------- */

const LAYERS: Array<{ token: string; label: string }> = [
  { token: "--background", label: "app canvas" },
  { token: "--card", label: "elevated: card + dialogs (--modal is this tier)" },
  { token: "--popover", label: "menus & tooltips — above modals by design" },
];

function LayerStack({
  paint,
  layers,
}: {
  paint: TokenContext;
  layers: Array<{ token: string; label: string }>;
}) {
  const [head, ...rest] = layers;
  if (!head) return null;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-3"
      style={{
        background: paint.color(head.token),
        borderColor: paint.color("--border"),
      }}
    >
      <code
        className="font-mono text-[10px] leading-4"
        style={{ color: paint.color("--muted-foreground") }}
      >
        {head.token} · {head.label}
      </code>
      {rest.length > 0 && <LayerStack paint={paint} layers={rest} />}
    </div>
  );
}

export function LayeringSection({
  lightCtx,
  darkCtx,
}: {
  lightCtx: TokenContext;
  darkCtx: TokenContext;
}) {
  // Only show tiers the current stylesheet actually declares, so the demo
  // stays truthful on branches where a surface token does not exist yet.
  const layers = LAYERS.filter(
    ({ token }) =>
      lightCtx.decl(token) !== undefined || darkCtx.decl(token) !== undefined,
  );
  return (
    <PageSection
      title="Layering model"
      blurb="Surfaces stack from the canvas outward: each dark layer steps lighter; light alternates back to white. Elevation is these lightness steps plus hairline borders, not shadows. Never paint a surface darker than what it floats above."
      aside={<InlineCode>{layers.length} tiers</InlineCode>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { label: "light", paint: lightCtx },
          { label: "dark", paint: darkCtx },
        ].map(({ label, paint }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <Eyebrow>{label}</Eyebrow>
            <LayerStack paint={paint} layers={layers} />
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        Two tiers sit outside this stack: the sidebar frame (
        <InlineCode>--sidebar-background</InlineCode>) lifts one step above the
        canvas beside the content, and the code well (
        <InlineCode>--surface-code</InlineCode>) is the one recessed tier. The
        full ladder, light and dark side by side, is on the Color page&apos;s
        background ramp.
      </p>
    </PageSection>
  );
}

/** Short, honest description per layer band (source: layer.tsx JSDoc). */
const LAYER_DESCRIPTIONS: Record<string, string> = {
  panel: "docked side surfaces: Sheet, Drawer, table peek",
  agent: "the in-app assistant window, below every true overlay",
  modal: "blocking Dialog and AlertDialog surfaces",
  popover: "Popover, DropdownMenu, Select; above modal by design",
  tooltip: "Tooltip and bespoke anchored tooltips",
  toast: "Sonner toasts, always on top",
};

/**
 * The app's overlay layer order, read from components/ui/layer.tsx. These are
 * code constants mapped to DOM containers in _document.tsx, not CSS tokens:
 * layers stack purely by DOM order.
 */
export function LayerSystemSection({ ctx }: { ctx: TokenContext }) {
  return (
    <PageSection
      title="Overlay layers"
      blurb="Overlays portal through layer containers, never raw z-index. Bands stack by DOM order."
      aside={<InlineCode>{LAYER_ORDER.length} bands</InlineCode>}
    >
      <div
        className="relative overflow-hidden rounded-md border p-4"
        style={{
          background: ctx.color("--background"),
          height: `${LAYER_ORDER.length * 34 + 72}px`,
        }}
      >
        {LAYER_ORDER.map((name, index) => (
          <div
            key={name}
            className="absolute flex w-72 max-w-full items-baseline gap-2 rounded-md border px-3 py-2"
            style={{
              left: `${16 + index * 28}px`,
              top: `${16 + index * 34}px`,
              background: ctx.color("--card"),
              color: ctx.color("--foreground"),
            }}
          >
            <code className="font-mono text-[11px]">{name}</code>
            <span
              className="truncate text-[10px]"
              title={LAYER_DESCRIPTIONS[name]}
              style={{ color: ctx.color("--muted-foreground") }}
            >
              {LAYER_DESCRIPTIONS[name] ?? ""}
            </span>
          </div>
        ))}
        <span className="text-muted-foreground absolute right-3 bottom-2 font-mono text-[10px]">
          later in LAYER_ORDER paints on top ↘
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        Source of truth: <InlineCode>LAYER_ORDER</InlineCode> in{" "}
        <code className="font-mono">components/ui/layer.tsx</code>, enforced by
        the <code className="font-mono">@repo/no-overlay-zindex</code> lint
        rule.
      </p>
    </PageSection>
  );
}

/**
 * Per-token setup the animation needs to be visible: rainbow animates
 * background-position (needs a >100% background-image), the accordion pair
 * animates height to --radix-accordion-content-height (unset outside Radix).
 */
function animationSampleStyle(ctx: TokenContext, name: string): CSSProperties {
  if (name === "--animate-rainbow") {
    return {
      backgroundImage: `linear-gradient(90deg, ${ctx.color("--chart-1")}, ${ctx.color("--chart-2")}, ${ctx.color("--chart-3")}, ${ctx.color("--chart-1")})`,
      backgroundSize: "200% 100%",
    };
  }
  if (name.startsWith("--animate-accordion")) {
    return {
      "--radix-accordion-content-height": "1rem",
      overflow: "hidden",
    } as CSSProperties;
  }
  return {};
}

/** @theme inline animation tokens, collapsed (low traffic). */
export function AnimationsSection({ ctx, lightCtx, darkCtx }: RowContexts) {
  return (
    <CollapsedSection
      title="Animations"
      blurb="@theme inline animation tokens: each emits an animate-* utility wired to a keyframe in globals.css."
      count={animationTokens.length}
    >
      {animationTokens.map((token) => (
        <TokenRow
          key={token.name}
          name={token.name}
          staticDecl={token}
          ctx={ctx}
          lightCtx={lightCtx}
          darkCtx={darkCtx}
          sample={
            <div
              className="rounded-md border px-2.5 py-1.5"
              style={{ background: ctx.color("--background") }}
            >
              <span
                className="bg-muted inline-block h-4 w-14 rounded-sm"
                style={{
                  animation: ctx.resolve(token.value),
                  ...animationSampleStyle(ctx, token.name),
                }}
              />
            </div>
          }
        />
      ))}
    </CollapsedSection>
  );
}

/** Breakpoints are deliberately not tokenized; say so instead of inventing. */
export function BreakpointsNote() {
  return (
    <PageSection
      title="Breakpoints"
      blurb="No custom breakpoint tokens; Tailwind's default sm / md / lg / xl / 2xl screens."
    >
      <></>
    </PageSection>
  );
}

export function Layout() {
  const { ctx, lightCtx, darkCtx } = useTokenContexts();
  const rowContexts = { ctx, lightCtx, darkCtx };

  const radiusCount = (radiusEntry ? 1 : 0) + inlineRadii.length;
  const layoutCount = bannerEntries.length + spacingTokens.length;

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
        <PageHeader
          eyebrow="Design tokens"
          title="Layout"
          lede={
            <>
              Radii, layout offsets, surface layering, overlay order,
              animations. Parsed at build time from{" "}
              <code className="font-mono">src/styles/globals.css</code>; the
              layer order from{" "}
              <code className="font-mono">components/ui/layer.tsx</code>.
            </>
          }
          meta={
            <>
              {radiusCount} radius tokens · {layoutCount} layout tokens ·{" "}
              {LAYER_ORDER.length} overlay layers · {animationTokens.length}{" "}
              animation tokens
            </>
          }
        />
        <RadiiSection {...rowContexts} />
        <LayoutOffsetsSection {...rowContexts} />
        <LayeringSection lightCtx={lightCtx} darkCtx={darkCtx} />
        <LayerSystemSection ctx={ctx} />
        <BreakpointsNote />
        <AnimationsSection {...rowContexts} />
        <p className="text-muted-foreground text-sm">
          Component spacing uses Tailwind&apos;s default rem scale (
          <InlineCode>p-2</InlineCode>, <InlineCode>gap-4</InlineCode>, …).
        </p>
      </div>
    </div>
  );
}
