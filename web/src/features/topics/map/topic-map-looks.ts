/**
 * Exploratory Scatter 1 and Scatter 2 treatments of the scatter map.
 * To remove them: delete this file, then every line marked
 * "Exploratory scatter looks".
 */
import { type CSSProperties } from "react";
import { screenPoint, type TopicMapNodeFrame } from "./prepare-topic-map";

export type TopicMapLookName = "scatter1" | "scatter2";

type TopicMapLook = {
  background: string;
  field: {
    kind: "ring" | "disc";
    everyNth: number;
    base: number;
    border: number;
    blur: number;
    opacity: number;
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
    background: "#f7f8fb",
    field: {
      kind: "ring",
      everyNth: 3,
      base: 92,
      border: 14,
      blur: 16,
      opacity: 0.55,
    },
    grain: 0.4,
    dot: { size: 4.5, ring: 1, ringAlpha: 0.9, shade: 0.72 },
    label: {
      size: 11,
      lineHeight: 14,
      tracking: "0.01em",
      color: "#27272a",
      shadow: "0 0 3px #f7f8fb, 0 0 6px #f7f8fb",
    },
  },
  scatter2: {
    background: "#fcfcfa",
    field: {
      kind: "disc",
      everyNth: 1,
      base: 84,
      border: 0,
      blur: 22,
      opacity: 0.35,
    },
    grain: 0.24,
    // Scatter 1's thin ring, in saturated tones so nearby hues stay apart.
    dot: {
      size: 5.5,
      ring: 1,
      ringAlpha: 0.9,
      shade: 1,
      vivid: { lightness: 0.7, chroma: 0.14 },
    },
    label: {
      size: 12,
      lineHeight: 16,
      tracking: "0",
      color: "#3f3f46",
      shadow: "0 0 3px #fcfcfa, 0 0 6px #fcfcfa",
    },
  },
};

/** Dark mode is a first pass: theme background, screen-blended fields, quieter grain. */
const DARK = { fieldOpacity: 0.7, grain: 0.5 };

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

type Rgb = [number, number, number];

/**
 * One blurred layer per topic. Shapes live in map space, so their size and
 * blur scale with zoom.
 */
export function drawLookFields(
  context: CanvasRenderingContext2D,
  frame: TopicMapNodeFrame,
  name: TopicMapLookName,
  rgbOf: (color: string) => Rgb,
  ratio: number,
) {
  const { field } = TOPIC_MAP_LOOKS[name];
  const { model, camera, size, matchingTraceIds } = frame;
  const dark = isDark();
  const layer = document.createElement("canvas");
  layer.width = context.canvas.width;
  layer.height = context.canvas.height;
  const draw = layer.getContext("2d");
  if (!draw) return;
  draw.setTransform(ratio, 0, 0, ratio, 0, 0);
  const scale = camera.zoom;
  for (const zone of frame.zones) {
    if (zone.id === "outliers" || zone.id === "awaiting_map") continue;
    const [r, g, b] = rgbOf(zone.color);
    draw.clearRect(0, 0, size.width, size.height);
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
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.filter = `blur(${field.blur * scale * ratio}px)`;
    context.globalCompositeOperation = dark ? "screen" : "multiply";
    context.globalAlpha =
      field.opacity * (dark ? DARK.fieldOpacity : 1) * (matches ? 1 : 0.15);
    context.drawImage(layer, 0, 0);
    context.restore();
  }
}

/** The category hues behind the `--category-*-highlight` tokens. */
const CATEGORY_HUES: Record<string, number> = {
  violet: 293,
  blue: 252,
  teal: 190,
  green: 135,
  amber: 70,
  pink: 350,
};

/** The color a look paints a topic's dots in, before shading. */
export function lookDotColor(name: TopicMapLookName, color: string) {
  const { vivid } = TOPIC_MAP_LOOKS[name].dot;
  const hue = /--category-(\w+)-highlight/.exec(color)?.[1];
  if (!vivid || !hue || CATEGORY_HUES[hue] === undefined) return color;
  return `oklch(${vivid.lightness} ${vivid.chroma} ${CATEGORY_HUES[hue]})`;
}

/** A dot in its topic color, darkened by the look's shade and ringed in the stage background. */
export function drawLookDot(
  context: CanvasRenderingContext2D,
  name: TopicMapLookName,
  center: { x: number; y: number },
  rgb: Rgb,
  background: Rgb,
  opacity: number,
) {
  const { dot } = TOPIC_MAP_LOOKS[name];
  const [r, g, b] = rgb.map((value) => Math.round(value * dot.shade));
  context.globalAlpha = opacity * dot.ringAlpha;
  context.beginPath();
  context.arc(center.x, center.y, dot.size / 2 + dot.ring, 0, 2 * Math.PI);
  context.fillStyle = `rgb(${background.join(", ")})`;
  context.fill();
  context.globalAlpha = opacity;
  context.beginPath();
  context.arc(center.x, center.y, dot.size / 2, 0, 2 * Math.PI);
  context.fillStyle = `rgb(${r}, ${g}, ${b})`;
  context.fill();
}

/** The stage background, for dot rings; `surface` is the resolved theme background. */
export function lookBackground(name: TopicMapLookName, surface: string) {
  return isDark() ? surface : TOPIC_MAP_LOOKS[name].background;
}
