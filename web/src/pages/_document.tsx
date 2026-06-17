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
    <Html>
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
