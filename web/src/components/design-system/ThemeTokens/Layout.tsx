/**
 * Storybook-only layout reference (Design → Layout): the radius system, the
 * banner offset system used by fixed/sticky positioning, the app's overlay
 * layer order, animation tokens, and the breakpoint conventions.
 *
 * Token values are parsed at build time from `src/styles/globals.css` (see
 * parseThemeTokens.ts), so the page cannot drift from the stylesheet. The
 * layer order is read from its source of truth, `components/ui/layer.tsx`.
 *
 * Every section is a standalone component on purpose, so it can fold into
 * another reference page cheaply if this page is ever dissolved.
 */
import { LAYER_ORDER } from "@/src/components/ui/layer";

import {
  CollapsedSection,
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
      blurb="One base radius; the sm / md / lg steps derive from it, so a rounder or squarer feel is a one-token change."
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
      blurb="The banner height system used by fixed/sticky positioning: a banner raises --banner-height, everything below offsets by --banner-offset, and full-height layouts use screen-with-banner instead of 100svh."
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
      blurb="Overlays portal through layer containers, never raw z-index. The bands stack by DOM order (later paints on top); z-index stays a local tool within one layer."
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
        <code className="font-mono">components/ui/layer.tsx</code>, mapped to
        sibling containers after <code className="font-mono">#__next</code> in{" "}
        <code className="font-mono">_document.tsx</code>. These are code
        constants, not CSS tokens; the{" "}
        <code className="font-mono">@repo/no-overlay-zindex</code> lint rule
        guards the no-z-index half of the rule.
      </p>
    </PageSection>
  );
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
      blurb="No custom breakpoint tokens exist. Responsive behavior is utility-driven with Tailwind's default sm / md / lg / xl / 2xl screens; globals.css declares no overrides."
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
              Radii, layout offsets, the overlay layer order and the animation
              tokens. Token values are parsed at build time from{" "}
              <code className="font-mono">src/styles/globals.css</code>, so this
              page cannot drift from the file; the layer order is read from{" "}
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
        <LayerSystemSection ctx={ctx} />
        <BreakpointsNote />
        <AnimationsSection {...rowContexts} />
        <p className="text-muted-foreground text-sm">
          Component spacing itself uses Tailwind&apos;s default rem scale (
          <InlineCode>p-2</InlineCode>, <InlineCode>gap-4</InlineCode>, …); only
          the tokens above override or extend it.
        </p>
      </div>
    </div>
  );
}
