/**
 * Which text colour reads on a coloured bar — decided from the bar's own colour.
 *
 * A duration label drawn inside its bar has to contrast with the BAR, not with
 * the page, and no single colour can do that here: the type palette runs from
 * pastels to 600s. A hand-written table cannot either, because three of those
 * colours flip lightness between themes — the neutral grey goes from 91% to 16%
 * lightness, so a table right in light mode is wrong in dark mode.
 *
 * The browser is the only thing that knows what a class resolves to, so this asks
 * it: one hidden probe, one pass over the candidate classes, once per theme.
 *
 * Conversion goes through a canvas pixel rather than a regex over the computed
 * value. `getComputedStyle` hands back whatever colour space the token was
 * authored in — Chrome returns `oklch(59.6% 0.145 163)` verbatim for the palette
 * tokens that use it — and reading those three numbers as if they were R, G and B
 * turns a mid-tone into near-black, which then picks exactly the wrong text
 * colour. Painting the colour and reading the pixel is format-agnostic, and it
 * composites a translucent bar onto its surface for free.
 */

export type BarTextTone = "light" | "dark";

/**
 * WCAG's crossover. Below this relative luminance white text has the better
 * contrast ratio, above it black does — `1.05 / (L + 0.05)` against
 * `(L + 0.05) / 0.05`. Not 0.5: that over-picks white on mid-tones.
 */
const TONE_THRESHOLD = 0.179;

/** Relative luminance of an sRGB byte triple, per WCAG 2. */
const luminanceOf = (r: number, g: number, b: number): number => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/**
 * Memoized per theme, since that is the only thing that changes the answer —
 * every renderer on the page shares one probe per theme.
 */
const cache = new Map<string, Record<string, BarTextTone>>();

/**
 * Resolve each background class to the tone its text should take. Classes the
 * browser resolves to nothing are simply absent from the result, so a caller
 * falls back to its own default rather than to a wrong colour.
 *
 * `theme` is an input, not a decoration: it is what decides which colour a class
 * resolves to, and therefore what makes a previous answer stale.
 */
export function resolveBarTones(
  classNames: readonly string[],
  { theme = "", surfaceClassName = "bg-background" } = {},
): Record<string, BarTextTone> {
  const key = `${theme}|${surfaceClassName}|${classNames.join(",")}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const tones: Record<string, BarTextTone> = {};
  if (typeof document === "undefined") return tones;

  const context = document.createElement("canvas").getContext("2d");
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;left:-9999px;top:0;width:1px;height:1px;pointer-events:none";
  document.body.appendChild(probe);

  try {
    if (!context) return tones;
    const colourOf = (className: string) => {
      probe.className = className;
      return getComputedStyle(probe).backgroundColor;
    };

    const surface = colourOf(surfaceClassName);
    for (const className of classNames) {
      const colour = colourOf(className);
      // Paint the surface, then the bar on top: one pixel of honest sRGB, with
      // any alpha already composited.
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = surface;
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      if (r == null || g == null || b == null || a === 0) continue;
      tones[className] =
        luminanceOf(r, g, b) > TONE_THRESHOLD ? "dark" : "light";
    }
  } finally {
    probe.remove();
  }

  cache.set(key, tones);
  return tones;
}
