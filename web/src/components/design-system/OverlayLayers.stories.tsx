import React from "react";
import preview from "../../../.storybook/preview";

/**
 * Design-system documentation: how every overlay in the app stacks — by
 * structure (DOM order), not z-index. Rendered as a story (not standalone MDX,
 * which this Storybook setup doesn't wire a docs renderer for).
 */

const LAYERS: { name: string; holds: string; why: string }[] = [
  {
    name: "agent",
    holds: "the in-app assistant window",
    why: "persistent / draggable; floats above the page but BELOW every transient overlay",
  },
  {
    name: "modal",
    holds: "Dialog, AlertDialog, Sheet (incl. the table peek), Drawer",
    why: "blocking surfaces, above the page and the assistant",
  },
  {
    name: "popover",
    holds: "Popover, DropdownMenu, Select, HoverCard",
    why: "ABOVE modal, so a Select/Popover opened inside a Dialog still renders on top",
  },
  {
    name: "tooltip",
    holds: "Tooltip + bespoke anchored tooltips",
    why: "hints stay above their trigger, even inside a modal",
  },
  {
    name: "toast",
    holds: "Sonner toasts",
    why: "last, so they always sit above everything — by order alone, no z-index",
  },
];

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
    {children}
  </code>
);

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-foreground mt-8 mb-2 text-lg font-semibold">
    {children}
  </h2>
);

function OverlayLayersDoc() {
  return (
    <div className="text-foreground mx-auto max-w-3xl p-8 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Overlay layers</h1>
      <p className="text-muted-foreground mt-1">
        How every overlay in the app stacks —{" "}
        <strong>by structure (DOM order), not by z-index.</strong>
      </p>

      <H>The problem this solves</H>
      <p>
        Overlays — dialogs, dropdowns, tooltips, toasts, the in-app assistant —
        each used to portal to <Code>&lt;body&gt;</Code> and compete for
        &ldquo;who&rsquo;s on top&rdquo; with hand-picked z-index numbers. Those
        numbers kept escalating — <Code>z-50</Code> → <Code>z-51</Code> →{" "}
        <Code>z-60</Code> → <Code>z-[9999]</Code> — and whoever picked the
        bigger one won, until the next overlay reset the race. Real bugs
        followed: toasts hidden behind the trace peek, the search-bar error
        tooltip clipped, the nav dropdown colliding with the assistant window.
      </p>

      <H>The model</H>
      <p>
        The whole app renders inside <Code>#__next</Code>, which is its own
        isolated stacking context (<Code>isolation: isolate</Code>). That caps
        every z-index used inside the app — nothing in-app can paint over an
        overlay. The overlay layer containers are declared once in{" "}
        <Code>_document.tsx</Code> as <Code>&lt;body&gt;</Code> siblings{" "}
        <em>after</em> <Code>#__next</Code>, so they paint on top purely by DOM
        order (later = on top), and each is itself an isolated stacking context.
      </p>
      <p className="mt-2 font-medium">
        Ordering is the layer&rsquo;s job. Overlays carry no z-index.
      </p>

      <H>The layers (low → high)</H>
      <table className="mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-4 font-semibold">Layer</th>
            <th className="py-2 pr-4 font-semibold">Holds</th>
            <th className="py-2 font-semibold">Why it sits here</th>
          </tr>
        </thead>
        <tbody>
          {LAYERS.map((l) => (
            <tr key={l.name} className="border-b align-top">
              <td className="py-2 pr-4">
                <Code>{l.name}</Code>
              </td>
              <td className="py-2 pr-4">{l.holds}</td>
              <td className="text-muted-foreground py-2">{l.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground mt-2">
        <Code>LAYER_ORDER</Code> in <Code>components/ui/layer.tsx</Code> is the
        source of truth; <Code>_document.tsx</Code> maps it to the containers.
      </p>

      <H>Pointer events</H>
      <p>
        The layer containers are <Code>pointer-events: none</Code>, so the empty
        space around a non-modal overlay (like the table peek) stays
        click-through to the app behind it. Each portaled overlay opts itself
        back in with a single global rule —{" "}
        <Code>
          [data-overlay-root] &gt; [data-layer] &gt; * &#123; pointer-events:
          auto &#125;
        </Code>{" "}
        — so every overlay is interactive by construction, modal or not.
      </p>

      <H>How to use it</H>
      <ul className="ml-5 list-disc space-y-1">
        <li>
          <strong>Radix / Vaul primitive:</strong> route its{" "}
          <Code>*.Portal</Code> into a layer with{" "}
          <Code>useLayerContainer(name)</Code>. The <Code>ui/*</Code> wrappers
          (Dialog, DropdownMenu, Select, …) already do this, so most code gets
          it for free.
        </li>
        <li>
          <strong>Bespoke positioned content:</strong> render it through{" "}
          <Code>&lt;Layer name=&quot;…&quot;&gt;</Code>.
        </li>
        <li>
          <strong>Never</strong> give an overlay a z-index to
          &ldquo;escape&rdquo;, and <strong>never</strong> let a{" "}
          <Code>*.Portal</Code> fall back to <Code>&lt;body&gt;</Code>.
        </li>
      </ul>

      <H>The guardrail</H>
      <p>
        The <Code>@repo/no-overlay-zindex</Code> ESLint rule fails the build if
        a new overlay reaches for a z-index escape — so the category of bug
        can&rsquo;t return. Legit in-app chrome (sticky page headers, fixed top
        banners, the bulk-action bar) keeps its z-index: it lives inside{" "}
        <Code>#__next</Code> and never competes with overlays.
      </p>

      <p className="text-muted-foreground mt-8 border-t pt-4 text-xs">
        Part of the design system. Storybook is, step by step, becoming the home
        for these design-system decisions.
      </p>
    </div>
  );
}

const meta = preview.meta({
  title: "Design System/Overlay Layers",
  component: OverlayLayersDoc,
  parameters: { layout: "fullscreen" },
});

export const Overview = meta.story({});
