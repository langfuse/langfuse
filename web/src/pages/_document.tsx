import { Html, Head, Main, NextScript } from "next/document";

import { LAYER_ORDER } from "@/src/components/ui/layer";

// The app renders inside #__next (<Main />), which is isolated into its own
// stacking context (globals.css). The overlay layer containers are declared
// here as <body> siblings AFTER #__next, so they paint above the whole app by
// DOM order — no z-index needed. They are static HTML (present at SSR), ordered
// by LAYER_ORDER (later = on top); <Layer> (components/ui/layer.tsx) finds its
// container and portals into it. Styling lives in globals.css.
export default function Document() {
  return (
    // lang is set explicitly (not left to the i18n config, which is being
    // phased out in App Router) so screen readers always get the document
    // language — WCAG 2.1 SC 3.1.1.
    // next-themes mutates class/style on <html> before hydration; suppress the
    // expected mismatch one level deep (React 19 logs it and can re-render).
    <Html lang="en" suppressHydrationWarning>
      <Head />
      <body>
        <Main />
        <div data-overlay-root>
          {LAYER_ORDER.map((name) => (
            <div key={name} data-layer={name} />
          ))}
        </div>
        <NextScript />
      </body>
    </Html>
  );
}
