/** Scatter colors: the category palette with lighter dot tones. */

type Rgb = [number, number, number];

/** The category hues behind the `--category-*-highlight` tokens. */
const CATEGORY_HUES: Record<string, number> = {
  violet: 293,
  blue: 252,
  teal: 190,
  green: 135,
  amber: 70,
  pink: 350,
  peach: 45,
  olive: 100,
};
/** A lighter, more saturated tone of each hue, so dots read clearly on the halos. */
const DOT_TONE = { lightness: 0.7, chroma: 0.14 };
/** The dark neutral highlight sinks into the background, so dark-mode unassigned dots use a mid grey. */
const DARK_NEUTRAL_DOT = "oklch(0.62 0 0)";
const DARK_RING = "oklch(0.3 0 0)";

const isDark = () => document.documentElement.classList.contains("dark");

function dotColor(color: string) {
  if (isDark() && color.includes("--category-neutral-highlight"))
    return DARK_NEUTRAL_DOT;
  const hue = /--category-(\w+)-highlight/.exec(color)?.[1];
  const angle = hue ? CATEGORY_HUES[hue] : undefined;
  return angle === undefined
    ? color
    : `oklch(${DOT_TONE.lightness} ${DOT_TONE.chroma} ${angle})`;
}

type MapColors = {
  /** Fill for a dot of this topic color. */
  dot: (color: string) => string;
  /** The stage background behind each dot, as a thin separating ring. */
  ring: string;
  /** A topic color at an alpha, for halos and outlines. */
  paint: (color: string, alpha: number) => string;
};

/** Canvas can't read `var(--token)`, so colors resolve to RGB once per theme, not per frame. */
const cache = new WeakMap<
  HTMLCanvasElement,
  { key: string; colors: MapColors }
>();

export function mapColors(canvas: HTMLCanvasElement): MapColors {
  const root = document.documentElement;
  const key = `${root.className}|${root.style.cssText}`;
  const cached = cache.get(canvas);
  if (cached?.key === key) return cached.colors;
  const theme = getComputedStyle(canvas);
  const probe = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  const rgb = new Map<string, Rgb>();
  const rgbOf = (color: string): Rgb => {
    const known = rgb.get(color);
    if (known) return known;
    const token = /^var\((--[\w-]+)\)$/.exec(color)?.[1];
    const value = token ? theme.getPropertyValue(token).trim() || color : color;
    let resolved: Rgb = [148, 163, 184];
    if (probe) {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = value;
      probe.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
      resolved = [r, g, b];
    }
    rgb.set(color, resolved);
    return resolved;
  };
  // Canvas parses every new color string, so each color keeps one string per alpha.
  const strings = new Map<string, string>();
  const paint = (color: string, alpha: number) => {
    const id = `${color}|${alpha}`;
    let value = strings.get(id);
    if (!value) {
      const [r, g, b] = rgbOf(color);
      value = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      strings.set(id, value);
    }
    return value;
  };
  const background = `hsl(${theme.getPropertyValue(isDark() ? "--sidebar-background" : "--background").trim()})`;
  // One fill per topic color and theme, so drawing a dot is a lookup.
  const dots = new Map<string, string>();
  const colors: MapColors = {
    dot: (color) => {
      let value = dots.get(color);
      if (!value) {
        value = paint(dotColor(color), 1);
        dots.set(color, value);
      }
      return value;
    },
    ring: isDark() ? DARK_RING : paint(background, 1),
    paint,
  };
  cache.set(canvas, { key, colors });
  return colors;
}
