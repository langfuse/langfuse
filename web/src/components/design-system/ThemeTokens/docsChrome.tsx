/**
 * Shared presentational chrome for the Design reference pages (Color,
 * Typography, Layout, Charts).
 *
 * The voice borrows from langfuse.com's docs presentation (full-width hairline
 * dividers, mono uppercase eyebrow labels, restrained monochrome, crop-mark
 * corner ticks on framed panels) and from Kumo's component docs (muted cell
 * labels, small mono spec chips, quiet section headers). Everything renders
 * with the app's own tokens and type classes, so the chrome itself is a
 * specimen of the design system — in both themes.
 */
import { type ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";

/** The app's eyebrow-label convention: tiny, mono, uppercase, tracked. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-tertiary font-mono text-[10px] tracking-[0.05em] uppercase">
      {children}
    </span>
  );
}

/** Small mono chip for utility names, counts and inline values (Kumo-style). */
export function SpecChip({ children }: { children: ReactNode }) {
  return (
    <code className="bg-muted text-foreground rounded-sm border px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap">
      {children}
    </code>
  );
}

/** Page header: eyebrow · title · lede · mono meta line (langfuse.com docs). */
export function DocsPageHeader({
  eyebrow,
  title,
  lede,
  meta,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-foreground text-3xl font-bold tracking-tight">
        {title}
      </h1>
      {lede !== undefined && (
        <p className="text-tertiary max-w-2xl text-sm">{lede}</p>
      )}
      {meta !== undefined && (
        <p className="text-tertiary font-mono text-[11px] leading-4">{meta}</p>
      )}
    </header>
  );
}

/**
 * Section with the docs-site rhythm: a full-width hairline, then a quiet
 * header row (title + blurb left, optional aside right), then content.
 */
export function DocsSection({
  title,
  blurb,
  aside,
  children,
}: {
  title: ReactNode;
  blurb?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-foreground text-lg font-bold">{title}</h2>
          {blurb !== undefined && (
            <p className="text-tertiary max-w-2xl text-sm">{blurb}</p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

const TICK_POSITIONS = {
  tl: "-top-px -left-px border-t border-l",
  tr: "-top-px -right-px border-t border-r",
  bl: "-bottom-px -left-px border-b border-l",
  br: "-bottom-px -right-px border-b border-r",
} as const;

/**
 * Hairline panel with crop-mark corner ticks, the framing device langfuse.com
 * uses for its feature cells. Square corners on purpose — the marks read as
 * registration ticks on a print sheet.
 */
export function CropFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-elevated relative flex flex-col border">
      {(Object.keys(TICK_POSITIONS) as Array<keyof typeof TICK_POSITIONS>).map(
        (position) => (
          <span
            key={position}
            aria-hidden
            className={cn(
              "border-foreground/40 absolute size-2",
              TICK_POSITIONS[position],
            )}
          />
        ),
      )}
      {children}
    </div>
  );
}
