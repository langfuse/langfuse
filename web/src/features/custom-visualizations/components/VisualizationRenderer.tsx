import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import DOMPurify from "dompurify";
import { scaleBand, scaleLinear, scaleTime } from "d3-scale";
import { line } from "d3-shape";
import { AlertTriangle, FlaskConical } from "lucide-react";
import {
  type VisualizationDataEnvelope,
  type VisualizationDefinition,
} from "../types";
import { VISUALIZATION_RUNTIME_SOURCE } from "../fns/visualizationRuntime";

const FRAME_CSS = `
:root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 0; background: transparent; color: #18212f; }
body { padding: 20px; }
.stack { display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.compact { gap: 9px; }
.eyebrow { color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: .14em; }
h1, h2, p { margin: 0; } h1 { font-size: 26px; } h2 { font-size: 17px; }
.muted { color: #64748b; font-size: 13px; }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.metrics article, .metric { display: flex; flex-direction: column; gap: 3px; border: 1px solid #dbe2ea; border-radius: 10px; padding: 12px; background: rgba(248,250,252,.8); }
.metrics strong { font-size: 24px; font-weight: 600; } .metrics span { color: #64748b; font-size: 11px; }
.metric strong { font-size: 20px; } .metric span { color: #64748b; font-size: 11px; }
.headline { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.badge { border-radius: 999px; background: #e2e8f0; color: #334155; padding: 4px 8px; font-size: 11px; }
.tone-success { background: #dcfce7; color: #166534; } .tone-danger { background: #fee2e2; color: #991b1b; } .tone-warning { background: #fef3c7; color: #92400e; }
.sentence { font-size: 18px; line-height: 1.45; text-wrap: pretty; }
.facts { display: grid; grid-template-columns: minmax(80px, max-content) minmax(0, 1fr); gap: 7px 14px; margin: 0; font-size: 13px; }
.facts dt { color: #64748b; } .facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.ellipsis { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
.has-tooltip { position: relative; cursor: help; outline-offset: 2px; }
.has-tooltip:hover::after, .has-tooltip:focus-visible::after { content: attr(data-tooltip); position: absolute; z-index: 2; left: 0; bottom: calc(100% + 7px); width: max-content; max-width: min(360px, 80vw); white-space: normal; overflow-wrap: anywhere; border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 9px; background: #0f172a; color: #f8fafc; font: 11px/1.4 ui-sans-serif, system-ui, sans-serif; box-shadow: 0 8px 24px rgba(15,23,42,.18); }
.accordion { border-top: 1px solid #e2e8f0; padding-top: 9px; } .accordion summary { cursor: pointer; color: #475569; font-size: 12px; font-weight: 600; } .accordion-content { padding-top: 10px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 12px; } .data-table th, .data-table td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; vertical-align: top; } .data-table th { color: #64748b; font-size: 10px; text-transform: uppercase; }
.empty { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 16px; color: #64748b; font-size: 13px; text-align: center; }
pre { margin: 0; max-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 10px; background: #0f172a; color: #dbeafe; padding: 14px; font: 11px/1.5 ui-monospace, monospace; }
@media (prefers-color-scheme: dark) {
  html, body { color: #e5e7eb; }
  .muted, .eyebrow, .metrics span { color: #94a3b8; }
  .metrics article, .metric { border-color: #334155; background: rgba(15,23,42,.72); }
  .facts dt, .accordion summary { color: #94a3b8; } .accordion, .data-table th, .data-table td { border-color: #334155; }
}
`;

const escapeForScript = (value: unknown) =>
  (JSON.stringify(value) ?? "null")
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

const sandboxDocument = ({
  data,
  body,
  script,
  channel,
}: {
  data: VisualizationDataEnvelope;
  body: string;
  script: string;
  channel: string;
}) => `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; img-src data:; media-src 'none'; font-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" />
<style>${FRAME_CSS}</style>
</head><body><div id="viz-content">${body}</div><script>
"use strict";
const INPUT = ${escapeForScript(data)};
${VISUALIZATION_RUNTIME_SOURCE}
${script}
const resizeChannel = ${escapeForScript(channel)};
const resizeContent = document.getElementById("viz-content");
let lastReportedHeight = 0;
let resizeFrame = 0;
const reportHeight = () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (!resizeContent) return;
    const bounds = resizeContent.getBoundingClientRect();
    const height = Math.ceil(bounds.bottom + 20);
    if (height === lastReportedHeight) return;
    lastReportedHeight = height;
    parent.postMessage({ type: "langfuse-viz-size", channel: resizeChannel, height }, "*");
  });
};
if (resizeContent) new ResizeObserver(reportHeight).observe(resizeContent);
document.addEventListener("toggle", reportHeight, true);
requestAnimationFrame(reportHeight);
</script></body></html>`;

const templateDocument = (
  definition: VisualizationDefinition,
  data: VisualizationDataEnvelope,
  channel: string,
) => {
  if (definition.renderer.kind !== "template") return "";
  const sanitizedTemplate = DOMPurify.sanitize(definition.renderer.template, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style", "src", "href"],
  });
  return sandboxDocument({
    data,
    channel,
    body: '<div id="root"></div>',
    script: `
const source = ${escapeForScript(definition.renderer.prepareSource)};
const template = ${escapeForScript(sanitizedTemplate)};
const root = document.getElementById("root");
const displayValue = (value) => value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "text") ? value.text : value;
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const read = (value, path) => viz.get(value, path);
const render = (sourceTemplate, context) => sourceTemplate
  .replace(/{{#if\\s+([\\w.]+)}}([\\s\\S]*?){{\\/if}}/g, (_, path, content) => viz.present(read(context, path)) ? content : "")
  .replace(/{{#each\\s+([\\w.]+)}}([\\s\\S]*?){{\\/each}}/g, (_, path, content) => viz.array(read(context, path), 50).map((item) => render(content, Object.assign({}, context, { this: item }))).join(""))
  .replace(/{{\\s*([\\w.]+)\\s*}}/g, (_, path) => escapeHtml(displayValue(read(context, path))));
try {
  const prepared = new Function("data", "viz", '"use strict";\\n' + source)(INPUT, viz);
  root.innerHTML = render(template, prepared && typeof prepared === "object" ? prepared : { value: prepared });
} catch (error) {
  root.innerHTML = '<pre>Visualization failed: ' + escapeHtml(error instanceof Error ? error.message : String(error)) + '</pre>';
}
`,
  });
};

const codeDocument = (
  definition: VisualizationDefinition,
  data: VisualizationDataEnvelope,
  channel: string,
) => {
  if (definition.renderer.kind !== "react") return "";
  return sandboxDocument({
    data,
    channel,
    body: '<div id="root"></div>',
    script: `
const root = document.getElementById("root");
const source = ${escapeForScript(definition.renderer.source)};
try {
  new Function("root", "data", "ui", "viz", '"use strict";\\n' + source)(root, INPUT, ui, viz);
} catch (error) {
  root.innerHTML = '<pre>Sandbox failed: ' + String(error?.message || error) + '</pre>';
}
`,
  });
};

const shaderDocument = (
  definition: VisualizationDefinition,
  data: VisualizationDataEnvelope,
  channel: string,
) => {
  if (definition.renderer.kind !== "shader") return "";
  return sandboxDocument({
    data,
    channel,
    body: '<main id="root" class="stack"><div id="shader-copy" class="stack compact"></div><canvas id="canvas" style="width:100%;height:260px;border-radius:12px"></canvas><div id="shader-legend" class="row"></div><div id="shader-details"></div></main>',
    script: `
const prepareSource = ${escapeForScript(definition.renderer.prepareSource)};
let prepared = {};
try { prepared = new Function("data", "viz", '"use strict";\\n' + prepareSource)(INPUT, viz) || {}; }
catch (error) { prepared = { description: "Could not prepare shader data: " + String(error?.message || error) }; }
const copy = document.getElementById("shader-copy");
if (viz.present(prepared.headline)) copy.append(ui.heading(prepared.headline));
if (viz.present(prepared.description)) copy.append(ui.el("p", { className: "muted", text: viz.text(prepared.description) }));
const metrics = viz.array(prepared.metrics, 8).filter((metric) => metric && viz.present(metric.value));
if (metrics.length) copy.append(ui.el("section", { className: "metrics" }, metrics.map((metric) => ui.metric(metric.label, metric.value, metric.tooltip))));
const values = viz.array(prepared.values, 64).map(viz.number).filter((value) => value !== undefined);
const labels = viz.array(prepared.labels, 64);
const legend = document.getElementById("shader-legend");
labels.slice(0, values.length).forEach((label, index) => legend.append(ui.tooltip(ui.badge(viz.text(label, "Value " + (index + 1))), String(values[index]))));
if (viz.present(prepared.details)) document.getElementById("shader-details").append(ui.accordion("Details", ui.code(prepared.details)));
const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl", { antialias: false, powerPreference: "low-power" });
const vertex = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';
const fragment = ${escapeForScript(definition.renderer.fragmentShader)};
const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)); return shader; };
try {
  if (!gl) throw new Error("WebGL is unavailable");
  const program = gl.createProgram(); gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program); gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const resolution = gl.getUniformLocation(program, "u_resolution"); const time = gl.getUniformLocation(program, "u_time"); const valueUniform = gl.getUniformLocation(program, "u_values[0]"); const countUniform = gl.getUniformLocation(program, "u_count");
  if (valueUniform) gl.uniform1fv(valueUniform, new Float32Array([...values, ...Array(Math.max(0, 64 - values.length)).fill(0)]));
  if (countUniform) gl.uniform1i(countUniform, values.length);
  const start = performance.now(); let frame = 0; const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const draw = (now) => { if (frame++ > 3600) return; const ratio = Math.min(devicePixelRatio, 1.5); canvas.width = Math.max(1, canvas.clientWidth * ratio); canvas.height = Math.max(1, canvas.clientHeight * ratio); gl.viewport(0,0,canvas.width,canvas.height); if (resolution) gl.uniform2f(resolution, canvas.width, canvas.height); if (time) gl.uniform1f(time, (now-start)/1000); gl.drawArrays(gl.TRIANGLES,0,3); if (!reducedMotion) requestAnimationFrame(draw); }; requestAnimationFrame(draw);
} catch (error) { document.getElementById("root").innerHTML = '<pre>Shader failed: ' + String(error?.message || error) + '</pre>'; }
`,
  });
};

const readPath = (value: unknown, path: string): unknown =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );

function ChartRenderer({
  title,
  renderer,
  data,
}: {
  title: string;
  renderer: Extract<VisualizationDefinition["renderer"], { kind: "chart" }>;
  data: VisualizationDataEnvelope;
}) {
  const raw = readPath(data, renderer.dataPath);
  const rows = Array.isArray(raw) ? raw.slice(0, 100) : [];
  const values = rows
    .map((row, index) => {
      const record = row as Record<string, unknown>;
      const yValue = Number(record[renderer.yKey]);
      const xValue = record[renderer.xKey];
      return {
        key: `${String(xValue ?? "")}-${index}`,
        label: String(
          record[renderer.labelKey ?? renderer.xKey] ?? xValue ?? "",
        ),
        xValue,
        y: yValue,
      };
    })
    .filter((value) => Number.isFinite(value.y));

  if (values.length === 0) {
    return (
      <div className="text-muted-foreground flex h-56 items-center justify-center rounded-lg border border-dashed text-sm">
        This example has no finite numeric series at “
        {renderer.dataPath || "root"}”.
      </div>
    );
  }

  const width = 720;
  const height = 300;
  const x = scaleBand()
    .domain(values.map((value) => value.key))
    .range([44, width - 20])
    .padding(0.25);
  const yValues = values.map((value) => value.y);
  const yMin = Math.min(0, ...yValues);
  const yMax = Math.max(0, ...yValues);
  const y = scaleLinear()
    .domain([yMin, yMax === yMin ? yMin + 1 : yMax])
    .range([height - 34, 18]);
  const linePath = line<(typeof values)[number]>()
    .x((value) => (x(value.key) ?? 0) + x.bandwidth() / 2)
    .y((value) => y(value.y))(values);
  const numericXValues = values.map((value) => Number(value.xValue));
  const finiteNumericX = numericXValues.filter(Number.isFinite);
  const numericMin = finiteNumericX.length ? Math.min(...finiteNumericX) : 0;
  const numericMax = finiteNumericX.length ? Math.max(...finiteNumericX) : 1;
  const numericX = scaleLinear()
    .domain([
      numericMin,
      numericMax === numericMin ? numericMin + 1 : numericMax,
    ])
    .range([44, width - 20]);
  const dates = values.map((value) => new Date(String(value.xValue)));
  const validDates = dates.every((date) => !Number.isNaN(date.getTime()));
  const dateTimes = dates.map((date) => date.getTime());
  const timelineX = scaleTime()
    .domain(
      validDates
        ? [new Date(Math.min(...dateTimes)), new Date(Math.max(...dateTimes))]
        : [new Date(0), new Date(1)],
    )
    .range([44, width - 20]);
  const renderMarks = (): ReactNode => {
    if (renderer.chart === "line") {
      return (
        <>
          <path
            d={linePath ?? ""}
            fill="none"
            stroke={renderer.color}
            strokeWidth="3"
          />
          {values.map((value) => (
            <circle
              key={value.key}
              cx={(x(value.key) ?? 0) + x.bandwidth() / 2}
              cy={y(value.y)}
              r="4"
              fill={renderer.color}
              tabIndex={0}
            >
              <title>{`${value.label}: ${value.y}`}</title>
            </circle>
          ))}
        </>
      );
    }
    if (renderer.chart === "scatter") {
      return values.map((value, index) => (
        <circle
          key={value.key}
          cx={
            Number.isFinite(numericXValues[index])
              ? numericX(numericXValues[index])
              : (x(value.key) ?? 0) + x.bandwidth() / 2
          }
          cy={y(value.y)}
          r="5"
          fill={renderer.color}
          tabIndex={0}
        >
          <title>{`${value.label}: ${value.y}`}</title>
        </circle>
      ));
    }
    if (renderer.chart === "timeline" && validDates) {
      return values.map((value, index) => (
        <circle
          key={value.key}
          cx={timelineX(dates[index]!)}
          cy={y(value.y)}
          r="5"
          fill={renderer.color}
          tabIndex={0}
        >
          <title>{`${value.label}: ${value.y}`}</title>
        </circle>
      ));
    }
    return values.map((value) => (
      <rect
        key={value.key}
        x={x(value.key)}
        y={value.y >= 0 ? y(value.y) : y(0)}
        width={x.bandwidth()}
        height={Math.abs(y(0) - y(value.y))}
        rx="5"
        fill={renderer.color}
        tabIndex={0}
      >
        <title>{`${value.label}: ${value.y}`}</title>
      </rect>
    ));
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="bg-card h-full min-h-64 w-full rounded-xl border"
      role="img"
      aria-label={`${title} chart`}
    >
      {renderMarks()}
      {values.slice(0, 16).map((value) => (
        <text
          key={`label-${value.key}`}
          x={(x(value.key) ?? 0) + x.bandwidth() / 2}
          y={height - 14}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          {value.label.slice(0, 12)}
        </text>
      ))}
    </svg>
  );
}

function SandboxedVisualizationFrame({
  title,
  srcDoc,
  channel,
  frame,
}: {
  title: string;
  srcDoc: string;
  channel: string;
  frame: VisualizationDefinition["frame"];
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(frame.preferredHeight);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const receiveSize = (event: MessageEvent<unknown>) => {
      if (event.source !== iframe.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (message.type !== "langfuse-viz-size" || message.channel !== channel) {
        return;
      }
      const nextHeight = Number(message.height);
      if (!Number.isFinite(nextHeight)) return;
      setHeight(
        Math.max(
          frame.minHeight,
          Math.min(frame.maxHeight, Math.ceil(nextHeight)),
        ),
      );
    };
    window.addEventListener("message", receiveSize);
    return () => window.removeEventListener("message", receiveSize);
  }, [channel, frame.maxHeight, frame.minHeight]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      className="bg-card w-full rounded-xl border"
      style={{ minHeight: frame.minHeight, height, maxHeight: frame.maxHeight }}
      referrerPolicy="no-referrer"
    />
  );
}

export function VisualizationRenderer({
  definition,
  data,
}: {
  definition: VisualizationDefinition;
  data: VisualizationDataEnvelope;
}) {
  const channel = useId();
  const srcDoc = useMemo(() => {
    if (definition.renderer.kind === "template") {
      return templateDocument(definition, data, channel);
    }
    if (definition.renderer.kind === "react") {
      return codeDocument(definition, data, channel);
    }
    if (definition.renderer.kind === "shader") {
      return shaderDocument(definition, data, channel);
    }
    return "";
  }, [channel, data, definition]);

  if (definition.renderer.kind === "chart") {
    return (
      <div className="ph-no-capture w-full">
        <ChartRenderer
          title={definition.title}
          renderer={definition.renderer}
          data={data}
        />
      </div>
    );
  }

  return (
    <div className="ph-no-capture relative w-full">
      {definition.renderer.kind === "react" ? (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full border bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
          <FlaskConical className="h-3 w-3" /> Lab sandbox
        </div>
      ) : null}
      <SandboxedVisualizationFrame
        title={definition.title}
        srcDoc={srcDoc}
        channel={channel}
        frame={definition.frame}
      />
      {definition.renderer.kind === "shader" ? (
        <div className="text-muted-foreground mt-2 flex items-center gap-1 text-[10px]">
          <AlertTriangle className="h-3 w-3" /> Experimental GPU renderer ·
          capped pixel ratio and animation lifetime
        </div>
      ) : null}
    </div>
  );
}
