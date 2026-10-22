/**
 * Specimens use the same typed icon package as the app.
 */
import { File, Search, Settings } from "@langfuse/icons";
import { type ReactNode } from "react";

import { Eyebrow, InlineCode, PageHeader, PageSection, Panel } from "./shared";

const SIZES = [
  { size: "sm", px: 12 },
  { size: "base", px: 14 },
  { size: "lg", px: 20 },
  { size: "xl", px: 28 },
] as const;

function Example({
  verdict,
  caption,
  children,
}: {
  verdict: "Do" | "Don't";
  caption: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Panel>
        <div className="flex items-start gap-2 border-b px-4 py-3">
          <Eyebrow>{verdict}</Eyebrow>
        </div>
        <div className="flex grow items-center px-4 py-5">{children}</div>
      </Panel>
      <p className="text-muted-foreground text-xs">{caption}</p>
    </div>
  );
}

export function Icons() {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <PageHeader
          eyebrow="Design tokens"
          title="Icons"
          lede={
            <>
              Typed sizes and colours, inherited interaction states, and fixed
              stroke widths. Import icons from{" "}
              <code className="font-mono">@langfuse/icons</code>.
            </>
          }
          meta="sm · base · lg · xl · currentColor"
        />

        <PageSection
          title="Size"
          blurb="Use the semantic size prop. TypeScript rejects numeric sizes, dimensions, className, style, and strokeWidth."
          aside={<InlineCode>size</InlineCode>}
        >
          <Panel>
            <div className="flex flex-wrap items-center gap-10 px-4 py-5">
              {SIZES.map((size) => (
                <div
                  key={size.size}
                  className="text-icon-foreground flex items-center gap-3"
                >
                  <Settings size={size.size} aria-hidden />
                  <InlineCode>{size.size}</InlineCode>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {size.px}px
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <p className="text-muted-foreground text-sm">
            base is the default. lg is for headers and toasts; icons inside
            buttons and menu rows use base. xl is 28px. Illustration-sized SVGs
            outside the scale may use __rawStyle as an explicit escape hatch.
            Avoid __rawClassName and __rawStyle for ordinary icon styling;
            prefer semantic sizes and inherited colour. Primitives should not
            size their SVG children.
          </p>
        </PageSection>

        <PageSection
          title="Colour"
          blurb="Use the semantic color prop. Icons inherit the parent's text colour by default; color='default' selects icon-foreground. Other roles include foreground, muted, secondary, tertiary, and destructive. Keep parent-owned hover and selected states inherited. An icon paired with text is the same colour as the text or one step lighter, never darker; status colours are the exception."
          aside={<InlineCode>color</InlineCode>}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Example
              verdict="Do"
              caption="Icon one step lighter than its label."
            >
              <span className="text-foreground flex items-center gap-1.5 text-sm">
                <Search size="base" color="default" aria-hidden />
                Search traces
              </span>
            </Example>
            <Example verdict="Don't" caption="Icon darker than its label.">
              <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Search size="base" color="foreground" aria-hidden />
                Search traces
              </span>
            </Example>
          </div>
        </PageSection>

        <PageSection
          title="Alignment"
          blurb="An icon paired with a short single-line label is centre-aligned with that label, not baseline-aligned. Geometric centring is the start, not the end: some glyphs need a nudge of a pixel or two so the pair reads balanced. Icons beside multi-line text, such as a title with a subtitle, follow the layout of that block."
          aside={<InlineCode>items-center</InlineCode>}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Example verdict="Do" caption="Icon centred on the label.">
              <span className="text-foreground flex items-center gap-1.5 text-sm">
                <File size="base" color="default" aria-hidden />
                File
              </span>
            </Example>
            <Example verdict="Don't" caption="Icon sitting on the baseline.">
              <span className="text-foreground flex items-baseline gap-1.5 text-sm">
                <File size="base" color="default" aria-hidden />
                File
              </span>
            </Example>
          </div>
        </PageSection>

        <PageSection
          title="Stroke width"
          blurb="Lucide default only. No strokeWidth prop on any icon."
          aside={<InlineCode>strokeWidth</InlineCode>}
        >
          <Panel>
            <div className="flex items-center gap-3 px-4 py-5">
              <Settings size="lg" color="default" aria-hidden />
              <span className="text-muted-foreground font-mono text-[11px]">
                stroke-width 2 · lucide default
              </span>
            </div>
          </Panel>
        </PageSection>
      </div>
    </div>
  );
}
