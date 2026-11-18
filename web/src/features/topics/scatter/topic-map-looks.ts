/** Rendering values for the new scatter: blurred topic fields, ringed dots, grain and labels. */
import { type CSSProperties } from "react";
import {
  screenPoint,
  stageScale,
  type TopicMapModel,
  type TopicMapNodeFrame,
} from "./prepare-topic-map";

export type TopicMapLookName = "scatter1";

/** The look the new scatter draws with. */
export const LOOK: TopicMapLookName = "scatter1";

type TopicMapLook = {
  background: string;
  field: {
    kind: "ring" | "disc";
    everyNth: number;
    base: number;
    border: number;
    blur: number;
    opacity: number;
    /** A softer tone of each hue for the fields, so they read as a wash under the dots. */
    tone?: { lightness: number; chroma: number };
  };
  grain: number;
  dot: {
    size: number;
    ring: number;
    ringAlpha: number;
    /** Darkens the topic's highlight color. */
    shade: number;
    /** Replaces the highlight color with a more saturated tone of the same hue. */
    vivid?: { lightness: number; chroma: number };
  };
  label: {
    size: number;
    lineHeight: number;
    tracking: string;
    color: string;
    shadow: string;
  };
};

export const TOPIC_MAP_LOOKS: Record<TopicMapLookName, TopicMapLook> = {
  scatter1: {
    // White under the grain, so the grained map averages out to the nav's sunken background.
    background: "hsl(var(--background))",
    field: {
      kind: "ring",
      everyNth: 3,
      base: 92,
      border: 14,
      blur: 16,
      opacity: 0.55,
      tone: { lightness: 0.82, chroma: 0.08 },
    },
    grain: 0.6,
    dot: {
      size: 6,
      ring: 1,
      ringAlpha: 0.9,
      shade: 1,
      vivid: { lightness: 0.7, chroma: 0.14 },
    },
    label: {
      size: 12,
      lineHeight: 16,
      tracking: "0",
      color: "#27272a",
      // Stacked halos in the stage colour keep labels readable over dense dots.
      shadow: [1, 2, 3, 4, 6, 8]
        .map((blur) => `0 0 ${blur}px var(--look-label-halo)`)
        .join(", "),
    },
  },
};

/** Dark mode is a first pass: theme background, screen-blended fields, quieter grain. */
const DARK = {
  fieldOpacity: 0.7,
  grain: 0.5,
  fieldTone: { lightness: 0.5, chroma: 0.13 },
  ringAlpha: 0.9,
  ring: "oklch(0.3 0 0)",
  neutralDot: "oklch(0.62 0 0)",
};

const isDark = () => document.documentElement.classList.contains("dark");

/** CSS variables the stage, labels and chrome read; see topic-map.module.css. */
export function lookStyle(name: TopicMapLookName): CSSProperties {
  const look = TOPIC_MAP_LOOKS[name];
  return {
    "--look-bg": look.background,
    "--look-label-size": `${look.label.size}px`,
    "--look-label-line": `${look.label.lineHeight}px`,
    "--look-label-tracking": look.label.tracking,
    "--look-label-color": look.label.color,
    "--look-label-shadow": look.label.shadow,
  } as CSSProperties;
}

export function lookGrainOpacity(name: TopicMapLookName) {
  const { grain } = TOPIC_MAP_LOOKS[name];
  return isDark() ? grain * DARK.grain : grain;
}

/** Stable 0–1 value per trace, so field sizes hold still between renders. */
function traceHash(traceId: string) {
  let hash = 0;
  for (let i = 0; i < traceId.length; i++)
    hash = (hash * 31 + traceId.charCodeAt(i)) % 1_000_003;
  return (hash % 1000) / 1000;
}

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

export type Rgb = [number, number, number];

/** The color a look paints a topic's field in. */
function lookFieldColor(name: TopicMapLookName, color: string) {
  const { tone } = TOPIC_MAP_LOOKS[name].field;
  const hue = /--category-(\w+)-highlight/.exec(color)?.[1];
  if (!tone || !hue || CATEGORY_HUES[hue] === undefined) return color;
  // On dark, a deeper and more saturated tone glows instead of greying out.
  const { lightness, chroma } = isDark() ? DARK.fieldTone : tone;
  return `oklch(${lightness} ${chroma} ${CATEGORY_HUES[hue]})`;
}

const presenceCache = new WeakMap<TopicMapModel, Map<string, number>>();

/**
 * Field strength per topic. A field stacked under many others only adds to one
 * wash, so it fades from full (one other topic covers its center) to 10%
 * (three or more), then scales by the map's average.
 */
function fieldPresence(model: TopicMapModel) {
  const cached = presenceCache.get(model);
  if (cached) return cached;
  const topics = model.zones.filter(
    (zone) => zone.id !== "outliers" && zone.id !== "awaiting_map",
  );
  const extent = Math.max(
    model.bounds.maxX - model.bounds.minX,
    model.bounds.maxY - model.bounds.minY,
  );
  const reach = new Map(
    topics.map((zone) => {
      const spread = Math.sqrt(
        zone.points.reduce(
          (sum, point) =>
            sum + (point.x - zone.x) ** 2 + (point.y - zone.y) ** 2,
          0,
        ) / zone.points.length,
      );
      return [zone.id, Math.max(spread * 1.5, extent * 0.08)];
    }),
  );
  const own = new Map(
    topics.map((zone) => {
      const covering = topics.filter(
        (other) =>
          other !== zone &&
          Math.hypot(other.x - zone.x, other.y - zone.y) <
            (reach.get(other.id) ?? 0),
      ).length;
      return [zone.id, 1 - 0.9 * Math.min(1, Math.max(0, covering - 1) / 2)];
    }),
  );
  // A crowded map also softens its isolated topics, by the map's average strength.
  const average =
    [...own.values()].reduce((sum, value) => sum + value, 0) /
    Math.max(1, own.size);
  const presence = new Map(
    [...own].map(([id, value]) => [id, value * average]),
  );
  presenceCache.set(model, presence);
  return presence;
}

/** The fields of the whole map, painted once at the fit zoom. */
const fieldCache = new WeakMap<
  HTMLCanvasElement,
  {
    key: string;
    model: TopicMapNodeFrame["model"];
    matchingTraceIds: TopicMapNodeFrame["matchingTraceIds"];
    image: HTMLCanvasElement;
    margin: number;
  }
>();

/**
 * One blurred layer per topic. Shapes and blur live in map space, so the
 * fields are painted once and every frame only moves and scales that image.
 */
export function drawLookFields(
  context: CanvasRenderingContext2D,
  frame: TopicMapNodeFrame,
  name: TopicMapLookName,
  rgbOf: (color: string) => Rgb,
  ratio: number,
) {
  const { model, camera, size, matchingTraceIds } = frame;
  const key = [name, size.width, size.height, isDark()].join(",");
  let cached = fieldCache.get(context.canvas);
  if (
    !cached ||
    cached.key !== key ||
    cached.model !== model ||
    cached.matchingTraceIds !== matchingTraceIds
  ) {
    const painted = paintFields(frame, name, rgbOf);
    if (!painted) return;
    cached = { key, model, matchingTraceIds, ...painted };
    fieldCache.set(context.canvas, cached);
  }
  const origin = screenPoint(fitView(model), camera, model.bounds, size);
  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.translate(origin.x, origin.y);
  context.scale(camera.zoom, camera.zoom);
  context.drawImage(
    cached.image,
    -(cached.margin + size.width / 2),
    -(cached.margin + size.height / 2),
  );
  context.restore();
}

/** The camera that fits the whole map. */
function fitView(model: TopicMapModel) {
  return {
    x: (model.bounds.minX + model.bounds.maxX) / 2,
    y: (model.bounds.minY + model.bounds.maxY) / 2,
    zoom: 1,
  };
}

/** Paints every topic's field at the fit zoom, with a margin for their reach. */
function paintFields(
  frame: TopicMapNodeFrame,
  name: TopicMapLookName,
  rgbOf: (color: string) => Rgb,
) {
  const { field } = TOPIC_MAP_LOOKS[name];
  const { model, size, matchingTraceIds } = frame;
  const dark = isDark();
  const camera = fitView(model);
  const scale = stageScale(size);
  // The largest ring plus three blur radii, past which a field has faded out.
  const margin = Math.ceil((field.base * 0.65 + field.blur * 3) * scale);
  const image = document.createElement("canvas");
  const layer = document.createElement("canvas");
  // CSS-pixel resolution is enough, since the blur hides finer detail.
  image.width = layer.width = Math.ceil(size.width + margin * 2);
  image.height = layer.height = Math.ceil(size.height + margin * 2);
  const target = image.getContext("2d");
  const draw = layer.getContext("2d");
  if (!draw || !target) return null;
  draw.setTransform(1, 0, 0, 1, margin, margin);
  const presence = fieldPresence(model);
  for (const zone of frame.zones) {
    if (zone.id === "outliers" || zone.id === "awaiting_map") continue;
    const [r, g, b] = rgbOf(lookFieldColor(name, zone.color));
    draw.clearRect(-margin, -margin, layer.width, layer.height);
    zone.points.forEach((point, index) => {
      if (index % field.everyNth) return;
      const at = screenPoint(point, camera, model.bounds, size);
      const diameter =
        field.base * (0.8 + traceHash(point.traceId) * 0.5) * scale;
      draw.beginPath();
      if (field.kind === "ring") {
        const border = field.border * scale;
        draw.arc(
          at.x,
          at.y,
          Math.max(0, (diameter - border) / 2),
          0,
          2 * Math.PI,
        );
        draw.lineWidth = border;
        draw.strokeStyle = `rgb(${r}, ${g}, ${b})`;
        draw.stroke();
      } else {
        draw.arc(at.x, at.y, diameter / 2, 0, 2 * Math.PI);
        draw.fillStyle = `rgb(${r}, ${g}, ${b})`;
        draw.fill();
      }
    });
    const matches =
      !matchingTraceIds ||
      zone.points.some((point) => matchingTraceIds.has(point.traceId));
    target.filter = `blur(${field.blur * scale}px)`;
    // Each pixel keeps its strongest single tint, so stacked fields never turn muddy.
    target.globalCompositeOperation = dark ? "lighten" : "darken";
    target.globalAlpha =
      field.opacity *
      (presence.get(zone.id) ?? 1) *
      (dark ? DARK.fieldOpacity : 1) *
      (matches ? 1 : 0.4);
    target.drawImage(layer, 0, 0);
  }
  return { image, margin };
}

/** The color a look paints a topic's dots in, before shading. */
export function lookDotColor(name: TopicMapLookName, color: string) {
  const { vivid } = TOPIC_MAP_LOOKS[name].dot;
  // The dark neutral highlight sinks into the background, so dots use a mid grey.
  if (isDark() && color.includes("--category-neutral-highlight"))
    return DARK.neutralDot;
  const hue = /--category-(\w+)-highlight/.exec(color)?.[1];
  if (!vivid || !hue || CATEGORY_HUES[hue] === undefined) return color;
  return `oklch(${vivid.lightness} ${vivid.chroma} ${CATEGORY_HUES[hue]})`;
}

// Canvas parses every new color string, so each color gets one string per shade.
const cssRgbCache = new WeakMap<Rgb, Map<number, string>>();
function cssRgb(rgb: Rgb, shade: number) {
  let byShade = cssRgbCache.get(rgb);
  if (!byShade) cssRgbCache.set(rgb, (byShade = new Map()));
  let value = byShade.get(shade);
  if (!value) {
    value = `rgb(${rgb.map((channel) => Math.round(channel * shade)).join(", ")})`;
    byShade.set(shade, value);
  }
  return value;
}

/** A dot in its topic color, darkened by the look's shade and ringed in the stage background. */
export function drawLookDot(
  context: CanvasRenderingContext2D,
  name: TopicMapLookName,
  center: { x: number; y: number },
  rgb: Rgb,
  background: Rgb,
  opacity: number,
  zoom: number,
  stage: number,
) {
  const { dot } = TOPIC_MAP_LOOKS[name];
  // Dots grow gently as you zoom in (6px at the fit, about 10px at 300%) and on a larger stage.
  const radius = (dot.size * stage * Math.sqrt(Math.max(1, zoom))) / 2;
  // On dark, a mid-dark ring separates crowded dots without a hard black outline.
  const dark = isDark();
  context.globalAlpha = opacity * (dark ? DARK.ringAlpha : dot.ringAlpha);
  context.beginPath();
  context.arc(center.x, center.y, radius + dot.ring * stage, 0, 2 * Math.PI);
  context.fillStyle = dark ? DARK.ring : cssRgb(background, 1);
  context.fill();
  context.globalAlpha = opacity;
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, 2 * Math.PI);
  context.fillStyle = cssRgb(rgb, dot.shade);
  context.fill();
}

/** The stage background resolved for canvas, for dot rings. */
export function lookBackground(theme: CSSStyleDeclaration) {
  const token = isDark() ? "--sidebar-background" : "--background";
  return `hsl(${theme.getPropertyValue(token).trim()})`;
}
