// Renders the AI Gateway blog charts with D3 in jsdom and rasterizes them
// with resvg at 2x.
//
//   npm install && node render.mjs <out-dir> [--preview-width 400]
//
// Colors and type come from the langfuse.com theme (langfuse-docs style.css)
// and the app theme (web/src/styles/globals.css). Text is set in Inter, the
// site font; INTER_FONT_DIR points resvg at its static TTFs.

import fs from "node:fs";
import path from "node:path";
import * as d3 from "d3";
import { JSDOM } from "jsdom";
import { Resvg } from "@resvg/resvg-js";
import {
  MEMORY_LIMIT_MIB,
  memoryBursts,
  memoryLongStreams,
  ttftUnderLoad,
} from "./data.mjs";

const COLORS = {
  background: "#f6f6f3", // docs --surface-bg
  text: "#222220", // docs --text-primary
  textSecondary: "#3d3d38", // docs --text-secondary
  textTertiary: "#6b6b66", // docs --text-tertiary
  grid: "#e5e5e1", // docs --surface-2
  axis: "#cfcfc9", // docs --line-structure
  langfuse: "#4f39f6", // docs --text-links; app --primary-accent family
  node: "#6b6b66", // docs --text-tertiary
  python: "#a7a7a0", // docs --text-disabled
  limit: "#3d3d38", // docs --text-secondary
  error: "#cc3314", // docs --callout-error
};

const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
const WIDTH = 560;
const PAD_X = 20;
const TYPE = {
  title: { size: 22, weight: 600 },
  subtitle: { size: 15, weight: 400 },
  label: { size: 15, weight: 500 },
  value: { size: 14, weight: 400 },
  tick: { size: 14, weight: 400 },
  note: { size: 14, weight: 400 },
};

const SERIES_STYLE = {
  langfuse: { stroke: COLORS.langfuse, width: 3, label: COLORS.langfuse },
  node: { stroke: COLORS.node, width: 2, label: COLORS.textTertiary },
  python: { stroke: COLORS.python, width: 2, label: COLORS.textTertiary },
};

const DRAW_ORDER = ["python", "node", "langfuse"];

// jsdom has no layout engine, so text width is estimated from Inter's
// average advance width.
const textWidth = (text, { size, weight }) =>
  text.length * size * (weight >= 600 ? 0.62 : 0.58);

function wrap(text, style, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, style) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

function createSvg(height) {
  const dom = new JSDOM("<!DOCTYPE html><body></body>");
  const svg = d3
    .select(dom.window.document.body)
    .append("svg")
    .attr("xmlns", "http://www.w3.org/2000/svg")
    .attr("width", WIDTH)
    .attr("height", height)
    .attr("viewBox", `0 0 ${WIDTH} ${height}`)
    .attr("font-family", FONT)
    .attr("text-rendering", "geometricPrecision");
  svg
    .append("rect")
    .attr("width", WIDTH)
    .attr("height", height)
    .attr("fill", COLORS.background);
  return svg;
}

function text(parent, content, { x, y, style, fill, anchor = "start" }) {
  return parent
    .append("text")
    .attr("x", x)
    .attr("y", y)
    .attr("font-size", style.size)
    .attr("font-weight", style.weight)
    .attr("fill", fill)
    .attr("text-anchor", anchor)
    .text(content);
}

// Draws title, subtitle and footnote, and returns the y where the plot starts.
function frame(svg, height, { title, subtitle, note }) {
  const maxWidth = WIDTH - 2 * PAD_X;
  let y = 12;
  for (const line of wrap(title, TYPE.title, maxWidth)) {
    y += TYPE.title.size * 1.2;
    text(svg, line, { x: PAD_X, y, style: TYPE.title, fill: COLORS.text });
  }
  y += 4;
  for (const line of wrap(subtitle, TYPE.subtitle, maxWidth)) {
    y += TYPE.subtitle.size * 1.35;
    text(svg, line, {
      x: PAD_X,
      y,
      style: TYPE.subtitle,
      fill: COLORS.textTertiary,
    });
  }
  text(svg, note, {
    x: PAD_X,
    y: height - 16,
    style: TYPE.note,
    fill: COLORS.textTertiary,
  });
  return y + 30;
}

function yGrid(g, y, ticks, { x0, x1, format }) {
  for (const tick of ticks) {
    g.append("line")
      .attr("x1", x0)
      .attr("x2", x1)
      .attr("y1", y(tick))
      .attr("y2", y(tick))
      .attr("stroke", tick === 0 ? COLORS.axis : COLORS.grid)
      .attr("stroke-width", 1);
    text(g, format(tick), {
      x: x0 - 8,
      y: y(tick) + 4.5,
      style: TYPE.tick,
      fill: COLORS.textTertiary,
      anchor: "end",
    });
  }
}

function xTicks(g, ticks, { x, y0, title, titleX }) {
  for (const tick of ticks) {
    text(g, d3.format(",")(tick), {
      x: x(tick),
      y: y0 + 20,
      style: TYPE.tick,
      fill: COLORS.textTertiary,
      anchor: "middle",
    });
  }
  text(g, title, {
    x: titleX,
    y: y0 + 42,
    style: TYPE.tick,
    fill: COLORS.textSecondary,
    anchor: "middle",
  });
}

function seriesLine(g, points, style) {
  g.append("path")
    .attr("d", d3.line()(points))
    .attr("fill", "none")
    .attr("stroke", style.stroke)
    .attr("stroke-width", style.width)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round");
  for (const [px, py] of points) {
    g.append("circle")
      .attr("cx", px)
      .attr("cy", py)
      .attr("r", style.width + 1)
      .attr("fill", style.stroke)
      .attr("stroke", COLORS.background)
      .attr("stroke-width", 1.5);
  }
}

// Spreads two-line end labels vertically so none overlap, keeping each as
// close to its line end as the bounds allow.
function placeLabels(labels, { gap, min, max }) {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let pass = 0; pass < 50; pass++) {
    for (let i = 1; i < sorted.length; i++) {
      const overlap = sorted[i - 1].pos + gap - sorted[i].pos;
      if (overlap > 0) {
        sorted[i - 1].pos -= overlap / 2;
        sorted[i].pos += overlap / 2;
      }
    }
    for (const label of sorted) {
      label.pos = Math.min(max, Math.max(min, label.pos));
    }
  }
  return sorted;
}

function endLabels(g, labels, { x, gap, min, max }) {
  for (const label of labels) label.pos = label.y;
  for (const label of placeLabels(labels, { gap, min, max })) {
    const style = SERIES_STYLE[label.id];
    const nameStyle =
      label.id === "langfuse" ? { ...TYPE.label, weight: 600 } : TYPE.label;
    text(g, label.name, {
      x,
      y: label.pos - 2,
      style: nameStyle,
      fill: style.label,
    });
    text(g, label.value, {
      x,
      y: label.pos + TYPE.value.size + 1,
      style: TYPE.value,
      fill: style.label,
    });
  }
}

function ttftChart() {
  const height = 400;
  const svg = createSvg(height);
  const top = frame(svg, height, {
    title: "Under load, Rust stays flat",
    subtitle: "Added time to first token versus going direct, p50 (ms)",
    note: "Setup: 2 vCPU / 4 GiB container, ~500 KB streaming requests",
  });
  const plot = { left: 56, right: WIDTH - 154, top, bottom: height - 82 };
  const x = d3
    .scaleLinear()
    .domain([1, 100])
    .range([plot.left, plot.right]);
  const y = d3
    .scaleLinear()
    .domain([0, 2000])
    .range([plot.bottom, plot.top]);
  const g = svg.append("g");

  yGrid(g, y, [0, 500, 1000, 1500, 2000], {
    x0: plot.left,
    x1: plot.right,
    format: d3.format(","),
  });
  xTicks(g, ttftUnderLoad.concurrency, {
    x,
    y0: plot.bottom,
    title: "Concurrent streams",
    titleX: (plot.left + plot.right) / 2,
  });

  const byId = new Map(ttftUnderLoad.series.map((s) => [s.id, s]));
  for (const id of DRAW_ORDER) {
    const series = byId.get(id);
    seriesLine(
      g,
      series.values.map((v, i) => [x(ttftUnderLoad.concurrency[i]), y(v)]),
      SERIES_STYLE[id],
    );
  }

  endLabels(
    g,
    ttftUnderLoad.series.map((s) => {
      const last = s.values.at(-1);
      return {
        id: s.id,
        name: s.label,
        value: `${last < 10 ? d3.format(".1f")(last) : d3.format(",")(last)} ms`,
        y: y(last),
      };
    }),
    { x: plot.right + 12, gap: 38, min: plot.top + 8, max: plot.bottom - 18 },
  );
  return svg;
}

function memoryChart({ series, xScale, ticks, title, subtitle, xTitle }) {
  const height = 420;
  const svg = createSvg(height);
  const top = frame(svg, height, {
    title,
    subtitle,
    note: "Setup: 2 vCPU / 4 GiB container, ~500 KB streaming requests",
  });
  const plot = {
    left: 56,
    right: WIDTH - 154,
    top: top + 6,
    bottom: height - 82,
  };
  const GiB = 1024;
  const x = xScale.range([plot.left, plot.right]);
  const y = d3
    .scaleLinear()
    .domain([0, 4.6 * GiB])
    .range([plot.bottom, plot.top]);
  const g = svg.append("g");

  yGrid(
    g,
    y,
    [0, 1, 2, 3].map((v) => v * GiB),
    {
      x0: plot.left,
      x1: plot.right,
      format: (v) => String(v / GiB),
    },
  );
  xTicks(g, ticks, {
    x,
    y0: plot.bottom,
    title: xTitle,
    titleX: (plot.left + plot.right) / 2,
  });

  const limitY = y(MEMORY_LIMIT_MIB);
  g.append("line")
    .attr("x1", plot.left)
    .attr("x2", plot.right)
    .attr("y1", limitY)
    .attr("y2", limitY)
    .attr("stroke", COLORS.limit)
    .attr("stroke-width", 1.25)
    .attr("stroke-dasharray", "5 4");
  for (const [line, dy] of [
    ["4 GiB", -2],
    ["limit", 14],
  ]) {
    text(g, line, {
      x: plot.left - 8,
      y: limitY + dy,
      style: { ...TYPE.tick, weight: 500 },
      fill: COLORS.textSecondary,
      anchor: "end",
    });
  }

  const byId = new Map(series.map((s) => [s.id, s]));
  for (const id of DRAW_ORDER) {
    seriesLine(
      g,
      byId.get(id).points.map((p) => [x(p.at), y(p.peakMiB)]),
      SERIES_STYLE[id],
    );
  }

  for (const point of series.flatMap((s) => s.points).filter((p) => p.oomKills)) {
    const px = x(point.at);
    const py = y(point.peakMiB);
    g.append("circle")
      .attr("cx", px)
      .attr("cy", py)
      .attr("r", 7.5)
      .attr("fill", "none")
      .attr("stroke", COLORS.error)
      .attr("stroke-width", 2);
    text(
      g,
      point.oomKills === 1 ? "1 OOM kill" : `${point.oomKills} OOM kills`,
      {
        x: px,
        y: py - 14,
        style: { ...TYPE.tick, weight: 500 },
        fill: COLORS.error,
        anchor: "middle",
      },
    );
  }

  endLabels(
    g,
    series.map((s) => {
      const last = s.points.at(-1).peakMiB;
      return {
        id: s.id,
        name: s.label,
        value: `${d3.format(".1f")(last / GiB)} GiB`,
        y: y(last),
      };
    }),
    { x: plot.right + 12, gap: 38, min: plot.top + 8, max: plot.bottom - 18 },
  );
  return svg;
}

const memoryLongStreamChart = () =>
  memoryChart({
    series: memoryLongStreams,
    xScale: d3.scaleLinear().domain([100, 1500]),
    ticks: [100, 1000, 1500],
    title: "Langfuse (Rust) uses the least memory up to 1,000 streams",
    subtitle: "Peak container memory with ~5 s streams held open (GiB)",
    xTitle: "Concurrent streams",
  });

const memoryBurstChart = () =>
  memoryChart({
    series: memoryBursts,
    xScale: d3.scalePoint().domain([500, 1000, 2000]).padding(0.35),
    ticks: [500, 1000, 2000],
    title: "Only the Python gateway runs out of memory",
    subtitle: "Peak container memory during a burst of requests (GiB)",
    xTitle: "Requests in the burst",
  });

function fontOptions() {
  const dir = process.env.INTER_FONT_DIR ?? "/usr/share/fonts/truetype/macos";
  const files = ["Regular", "Medium", "SemiBold"]
    .map((w) => path.join(dir, `Inter-${w}.ttf`))
    .filter((f) => fs.existsSync(f));
  if (files.length === 0) {
    throw new Error(`No Inter-*.ttf in ${dir}; set INTER_FONT_DIR`);
  }
  return { fontFiles: files, loadSystemFonts: false, defaultFontFamily: "Inter" };
}

function main() {
  const args = process.argv.slice(2);
  const outDir = args[0];
  if (!outDir) throw new Error("usage: node render.mjs <out-dir>");
  const previewIndex = args.indexOf("--preview-width");
  const previewWidth = previewIndex >= 0 ? Number(args[previewIndex + 1]) : null;
  fs.mkdirSync(outDir, { recursive: true });
  const font = fontOptions();

  const charts = {
    "ttft-under-load": ttftChart,
    "memory-under-load": memoryLongStreamChart,
    "memory-under-load-burst": memoryBurstChart,
  };
  for (const [name, render] of Object.entries(charts)) {
    const svg = `${render().node().outerHTML}\n`;
    fs.writeFileSync(path.join(outDir, `${name}.svg`), svg);
    const png = new Resvg(svg, {
      font,
      fitTo: { mode: "width", value: WIDTH * 2 },
    }).render();
    fs.writeFileSync(path.join(outDir, `${name}.png`), png.asPng());
    if (previewWidth) {
      const preview = new Resvg(svg, {
        font,
        fitTo: { mode: "width", value: previewWidth },
      }).render();
      fs.writeFileSync(
        path.join(outDir, `${name}.preview-${previewWidth}.png`),
        preview.asPng(),
      );
    }
    console.log(`${name}: ${outDir}/${name}.{svg,png}`);
  }
}

main();
