export const VISUALIZATION_RUNTIME_SOURCE = String.raw`
const own = (value, key) => value != null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
const blockedKeys = new Set(["__proto__", "prototype", "constructor"]);
const present = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};
const readable = (value) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try { return JSON.stringify(value); } catch { return String(value ?? ""); }
};
const viz = Object.freeze({
  parse(value, maxDepth = 3) {
    let current = value;
    for (let depth = 0; depth < Math.max(0, Math.min(3, maxDepth)); depth += 1) {
      if (typeof current !== "string" || current.length > 100000) break;
      const trimmed = current.trim();
      if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) break;
      try { current = JSON.parse(trimmed); } catch { break; }
    }
    return current;
  },
  get(value, path) {
    return String(path || "").split(".").filter(Boolean).reduce((current, key) => {
      if (blockedKeys.has(key) || !own(current, key)) return undefined;
      return current[key];
    }, value);
  },
  array(value, limit = 50) {
    return Array.isArray(value) ? value.slice(0, Math.max(0, Math.min(100, limit))) : [];
  },
  text(value, fallback = "", limit = 600) {
    if (!present(value)) return fallback;
    const result = readable(value);
    return result.length > limit ? result.slice(0, Math.max(0, limit - 1)) + "…" : result;
  },
  number(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  },
  present,
  first(...values) { return values.find(present); },
  entries(value, limit = 20) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value).filter(([, item]) => present(item)).slice(0, Math.max(0, Math.min(50, limit)));
  },
  stripAnsi(value) { return readable(value).replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, ""); },
  clip(value, limit = 240) {
    const full = readable(value);
    const safeLimit = Math.max(16, Math.min(2000, limit));
    return { text: full.length > safeLimit ? full.slice(0, safeLimit - 1) + "…" : full, full, truncated: full.length > safeLimit };
  },
  duration(milliseconds) {
    const value = viz.number(milliseconds);
    if (value === undefined) return "";
    if (Math.abs(value) < 1000) return Math.round(value) + " ms";
    return (value / 1000).toFixed(value < 10000 ? 1 : 0) + " s";
  },
  bytes(value) {
    const bytes = viz.number(value);
    if (bytes === undefined) return "";
    const units = ["B", "KB", "MB", "GB"];
    let amount = Math.abs(bytes); let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
    return (bytes < 0 ? "-" : "") + amount.toFixed(unit === 0 ? 0 : 1) + " " + units[unit];
  },
  percent(value) {
    const number = viz.number(value);
    return number === undefined ? "" : (number * 100).toFixed(number < 0.1 ? 1 : 0) + "%";
  }
});
const allowedTags = new Set(["article", "section", "div", "span", "p", "strong", "em", "small", "h1", "h2", "h3", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tr", "th", "td", "pre", "code", "details", "summary"]);
const appendChildren = (element, children) => {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
};
const ui = Object.freeze({
  el(tag, props = {}, children = []) {
    const safeTag = allowedTags.has(String(tag)) ? String(tag) : "div";
    const element = document.createElement(safeTag);
    if (props.className) element.className = String(props.className);
    if (props.text !== undefined) element.textContent = String(props.text);
    if (props.title) element.title = String(props.title);
    if (props.ariaLabel) element.setAttribute("aria-label", String(props.ariaLabel));
    return appendChildren(element, children);
  },
  stack(children) { return appendChildren(ui.el("section", { className: "stack" }), children); },
  row(children) { return appendChildren(ui.el("div", { className: "row" }), children); },
  heading(text) { return ui.el("h2", { text: viz.text(text, "Result") }); },
  sentence(parts) {
    const element = ui.el("p", { className: "sentence" });
    for (const part of Array.isArray(parts) ? parts : [parts]) {
      if (!viz.present(part)) continue;
      if (typeof part === "object" && part !== null && own(part, "emphasis")) element.append(ui.el("strong", { text: viz.text(part.emphasis) }));
      else element.append(document.createTextNode(viz.text(part)));
    }
    return element;
  },
  badge(text, tone = "neutral") { return ui.el("span", { className: "badge tone-" + String(tone), text: viz.text(text) }); },
  metric(label, value, tooltip) {
    if (!viz.present(value)) return document.createDocumentFragment();
    const card = ui.el("article", { className: "metric" }, [ui.el("strong", { text: viz.text(value) }), ui.el("span", { text: viz.text(label) })]);
    return tooltip ? ui.tooltip(card, tooltip) : card;
  },
  facts(items) {
    const list = ui.el("dl", { className: "facts" });
    for (const item of viz.array(items, 20)) {
      if (!item || !viz.present(item.value)) continue;
      list.append(ui.el("dt", { text: viz.text(item.label) }), ui.el("dd", { text: viz.text(item.value), title: viz.text(item.value, "", 2000) }));
    }
    return list;
  },
  ellipsis(value, max = 36) {
    const clipped = viz.clip(value, Math.max(12, Math.min(160, max)));
    const node = ui.el("span", { className: "ellipsis", text: clipped.text, ariaLabel: clipped.full });
    return clipped.truncated ? ui.tooltip(node, clipped.full) : node;
  },
  tooltip(trigger, text) {
    if (!viz.present(text)) return trigger;
    trigger.classList.add("has-tooltip"); trigger.setAttribute("data-tooltip", viz.text(text, "", 2000)); trigger.setAttribute("tabindex", "0");
    return trigger;
  },
  accordion(title, children) {
    const details = ui.el("details", { className: "accordion" });
    details.append(ui.el("summary", { text: viz.text(title, "Details") }));
    details.append(appendChildren(ui.el("div", { className: "accordion-content" }), children));
    return details;
  },
  table(columns, rows) {
    const safeColumns = viz.array(columns, 8); const safeRows = viz.array(rows, 30);
    const table = ui.el("table", { className: "data-table" });
    const head = ui.el("tr"); safeColumns.forEach((column) => head.append(ui.el("th", { text: viz.text(column.label || column.key) })));
    table.append(appendChildren(ui.el("thead"), head));
    const body = ui.el("tbody");
    safeRows.forEach((row) => { const tr = ui.el("tr"); safeColumns.forEach((column) => tr.append(ui.el("td", { text: viz.text(viz.get(row, column.key), "") }))); body.append(tr); });
    table.append(body); return table;
  },
  code(value) { return ui.el("pre", { text: viz.stripAnsi(value) }); },
  empty(message = "No useful result returned") { return ui.el("p", { className: "empty", text: message }); }
});
`;

export const VISUALIZATION_RUNTIME_PROMPT = `Runtime helpers available to generated deterministic code:
- viz.parse(value, maxDepth=3): bounded JSON-in-string decoding.
- viz.get(value, "nested.path"): safe own-property lookup; prototype keys are blocked.
- viz.array(value, limit=50), viz.entries(value, limit=20): bounded collections.
- viz.present(value): preserves meaningful 0 and false but rejects null, blank strings, and empty containers.
- viz.first(...values), viz.text(value, fallback="", limit=600), viz.number(value).
- viz.stripAnsi(value), viz.duration(ms), viz.bytes(value), viz.percent(value).
- viz.clip(value, limit) returns {text, full, truncated}. Template scalar placeholders automatically display its text; use {{value.full}} in a title attribute. DOM code can pass it to ui.ellipsis instead.

DOM renderer palette (renderer kind "react" is an imperative, networkless DOM sandbox, not React):
- ui.stack(children), ui.row(children), ui.heading(text), ui.sentence(parts).
- ui.badge(text, tone), ui.metric(label, value, tooltip?), ui.facts([{label,value}]).
- ui.ellipsis(value, maxCharacters), ui.tooltip(node, fullText).
- ui.accordion(title, children): native accessible disclosure; the host frame resizes on open and close.
- ui.table([{key,label}], rows), ui.code(text), ui.empty(message).
- ui.el(tag, {className,text,title,ariaLabel}, children) only permits safe presentational tags.
Values are inserted as text, not HTML. Tooltips work on hover and keyboard focus. Never invent helpers or browser APIs.

Template renderer:
- prepareSource is a JavaScript function body called with (data, viz); it must return a compact presentation model.
- Escaped scalar placeholders: {{path}} and {{this.path}}.
- One-level conditional blocks: {{#if path}}...{{/if}}.
- One-level bounded list blocks: {{#each path}}...{{/each}} (maximum 50 items).
- Use class="ellipsis" title="{{fullValue}}" for an ellipsis-to-tooltip pattern and native <details><summary> for disclosure.
- Blocks must not be nested. Missing content should omit its entire block.

Chart renderer:
- Use only genuine finite numeric measurements. Missing values are omitted, never converted to zero.
- bar and line accept categorical x values; scatter requires numeric x/y; timeline requires date-like x and numeric y.
- Every mark exposes its exact label/value through a tooltip. Do not chart IDs, arbitrary key counts, string lengths, or encoded categorical state.

Shader renderer:
- prepareSource is called with (data, viz) and returns {headline, description, values, labels, metrics, details}.
- values are converted to at most 64 finite floats and exposed as uniform float u_values[64] plus uniform int u_count.
- u_resolution and u_time remain available. Animation must not imply that recorded data itself is changing.
- The runtime always renders the textual headline, metrics, legend labels, and details around the canvas. The shader is supplementary, never the only meaning.`;
