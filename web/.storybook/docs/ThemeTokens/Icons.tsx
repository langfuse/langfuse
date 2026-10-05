/**
 * Storybook-only icon reference (Design → Icons): the three size tokens, the
 * default icon colour, alignment next to a label, and stroke width. Every
 * specimen renders through the app's own utilities, so the page shows what
 * the stylesheet does rather than describing it.
 */
import { File, Search, Settings } from "lucide-react";
import { type ReactNode } from "react";

import { Eyebrow, InlineCode, PageHeader, PageSection, Panel } from "./shared";

const SIZES = [
  { utility: "icon-sm", px: 12, spacing: 3 },
  { utility: "icon-base", px: 14, spacing: 3.5 },
  { utility: "icon-lg", px: 20, spacing: 5 },
  { utility: "icon-xl", px: 28, spacing: 7 },
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
              Four sizes, one default colour, lucide default stroke. Sizes are
              utilities in{" "}
              <code className="font-mono">src/styles/globals.css</code>.
            </>
          }
          meta="icon-sm · icon-base · icon-lg · icon-xl · text-icon-foreground"
        />

        <PageSection
          title="Size"
          blurb="Icons take a size only from these four utilities. No raw h-*/w-*/size-* classes and no size prop."
          aside={<InlineCode>@utility icon-*</InlineCode>}
        >
          <Panel>
            <div className="flex flex-wrap items-center gap-10 px-4 py-5">
              {SIZES.map((size) => (
                <div key={size.utility} className="flex items-center gap-3">
                  <Settings
                    className={`${size.utility} text-icon-foreground`}
                    aria-hidden
                  />
                  <InlineCode>{size.utility}</InlineCode>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {size.px}px · --spacing × {size.spacing}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <p className="text-muted-foreground text-sm">
            icon-base is the default. icon-lg is for headers, toasts and
            illustrations; icons inside buttons and menu rows are icon-base.
            icon-xl covers 28 to 36px illustrations. Icons at 40px and above
            (chart and analytics empty states, the crash page) keep their raw
            sizes: illustration sizes, decision deferred. Every icon sets its
            size on the element itself; primitives do not size their svg
            children.
          </p>
        </PageSection>

        <PageSection
          title="Colour"
          blurb="text-icon-foreground is the default, set on the icon element, never through a container selector; it shares its value with muted-foreground. An icon paired with text is the same colour as the text or one step lighter, never darker. Status colours are the only exception."
          aside={<InlineCode>text-icon-foreground</InlineCode>}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Example
              verdict="Do"
              caption="Icon one step lighter than its label."
            >
              <span className="text-foreground flex items-center gap-1.5 text-sm">
                <Search
                  className="icon-base text-icon-foreground"
                  aria-hidden
                />
                Search traces
              </span>
            </Example>
            <Example verdict="Don't" caption="Icon darker than its label.">
              <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Search className="icon-base text-foreground" aria-hidden />
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
                <File className="icon-base text-icon-foreground" aria-hidden />
                File
              </span>
            </Example>
            <Example verdict="Don't" caption="Icon sitting on the baseline.">
              <span className="text-foreground flex items-baseline gap-1.5 text-sm">
                <File className="icon-base text-icon-foreground" aria-hidden />
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
              <Settings className="icon-lg text-icon-foreground" aria-hidden />
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
