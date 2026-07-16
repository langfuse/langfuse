/**
 * Theme Lab - dev-only surface ladder / typography / text-color tuner.
 *
 * Vanilla-DOM port of `.screenshots-review/_tools/theme-lab.js` (the
 * standalone console/bookmarklet copy, which remains the fallback for
 * non-dev contexts). Keep the two semantically in sync when changing logic.
 * The panel deliberately uses hardcoded inline-style chrome (not app tokens)
 * so it stays legible while the theme underneath is being tweaked.
 *
 * Ladder + text-color tokens are overridden inline on <html> via setProperty.
 * Text-size tokens are Tailwind v4 `@theme inline` values compiled to literal
 * font-sizes in the .text-* utilities, so runtime custom-property overrides
 * cannot reach them - the typography section instead injects a managed
 * <style id="theme-lab-typography"> tag with !important rules.
 */

type Mode = "dark" | "light";

interface Triplet {
  h: string;
  s: string;
  l: number;
}

interface Tier {
  key: string;
  label: string;
  props: string[];
}

interface TextTier {
  key: string;
  label: string;
  prop: string;
  vs: string;
}

interface TypeToken {
  key: string;
  def: number;
}

interface Pairing {
  val: string;
  label: string;
  bold: string | null;
}

interface LadderRowEls {
  slider: HTMLInputElement;
  num: HTMLInputElement;
}

interface TypoRowEls extends LadderRowEls {
  label: HTMLSpanElement;
  pxHint: HTMLSpanElement;
  weight: HTMLSelectElement;
  defOpt: HTMLOptionElement;
}

interface TextRowEls extends LadderRowEls {
  label: HTMLSpanElement;
  ratio: HTMLSpanElement;
}

interface PersistedTypo {
  pairing?: unknown;
  sizes?: Record<string, unknown>;
  weights?: Record<string, unknown>;
}

interface Persisted extends Record<string, unknown> {
  typo?: PersistedTypo;
  textColors?: Partial<Record<Mode, Record<string, unknown>>>;
}

interface SavedOut extends Record<string, unknown> {
  typo?: {
    pairing?: string;
    sizes?: Record<string, number>;
    weights?: Record<string, number>;
  };
  textColors?: Partial<Record<Mode, Record<string, number>>>;
}

declare global {
  interface Window {
    themeLab?: { enable: () => void; disable: () => void };
  }
}

const PANEL_ID = "theme-lab-panel";
const LS_KEY = "themeLabOverrides";
const TYPO_STYLE_ID = "theme-lab-typography";
const PRECONNECT_ID = "theme-lab-fonts-preconnect";
// Sans and Mono load separately with face-specific checks: the app ships
// IBM Plex Mono (not Plex Sans, since the swap to Inter), so a loose
// "IBM Plex" match would wrongly skip loading the Sans face.
const PLEX_SANS_CSS_ID = "theme-lab-plex-sans-css";
const PLEX_SANS_URL =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap";
const PLEX_MONO_CSS_ID = "theme-lab-plex-mono-css";
const PLEX_MONO_URL =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap";
const INTER_CSS_ID = "theme-lab-inter-css";
const INTER_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap";

// Three-way font pairing; bold = --font-weight-bold inline override so the
// bold comparison stays fair per family (null = leave the shipped value).
const PAIRINGS: Pairing[] = [
  { val: "default", label: "App default", bold: null },
  { val: "inter", label: "Inter", bold: "600" },
  { val: "plex", label: "IBM Plex", bold: "500" },
];

// Primary ladder, ordered darkest (bottom) to lightest (top).
const TIERS: Tier[] = [
  {
    key: "chrome",
    label: "chrome",
    props: ["--header", "--sidebar-background"],
  },
  { key: "canvas", label: "canvas", props: ["--background"] },
  { key: "card", label: "card", props: ["--card"] },
  { key: "modal", label: "modal", props: ["--modal"] },
  { key: "popover", label: "popover", props: ["--popover"] },
  { key: "border", label: "hairline", props: ["--border"] },
];

// Secondary tokens, collapsed by default; not part of the gap/ordering checks.
const EXTRAS: Tier[] = [
  { key: "sbBorder", label: "sb-border", props: ["--sidebar-border"] },
  { key: "sbAccent", label: "sb-accent", props: ["--sidebar-accent"] },
  { key: "code", label: "code", props: ["--surface-code"] },
  { key: "muted", label: "muted", props: ["--muted"] },
  { key: "accent", label: "accent", props: ["--accent"] },
];

const ALL: Tier[] = TIERS.concat(EXTRAS);

// Text-tier color tokens: same H/S-from-baseline, L-only mechanic as the
// ladder, but namespaced per light/dark mode and shown with a live WCAG
// contrast ratio against the surface behind them (vs).
const TEXT_TIERS: TextTier[] = [
  { key: "body", label: "body", prop: "--foreground", vs: "--background" },
  {
    key: "meta",
    label: "meta",
    prop: "--muted-foreground",
    vs: "--background",
  },
  {
    key: "faint",
    label: "faint",
    prop: "--foreground-tertiary",
    vs: "--background",
  },
  {
    key: "sidebar",
    label: "sidebar",
    prop: "--sidebar-foreground",
    vs: "--sidebar-background",
  },
  { key: "link", label: "link", prop: "--link", vs: "--background" },
  {
    key: "linkHover",
    label: "link-hover",
    prop: "--link-hover",
    vs: "--background",
  },
];

// The vs surfaces are ladder tiers; map prop -> ladder state key so contrast
// tracks live ladder edits.
const VS_LADDER_KEY: Record<string, string> = {
  "--background": "canvas",
  "--sidebar-background": "chrome",
};

// Tailwind v4 text-size tokens; defaults are the globals.css rem values verbatim.
const TYPE_TOKENS: TypeToken[] = [
  { key: "xs", def: 0.7 },
  { key: "sm", def: 0.825 },
  { key: "base", def: 0.9 },
  { key: "lg", def: 1.1 },
  { key: "xl", def: 1.2 },
  { key: "2xl", def: 1.3 },
  { key: "3xl", def: 1.5 },
];

const WEIGHTS = [400, 450, 500, 600, 700];

const PRESETS: { name: string; vals: Record<string, number> }[] = [
  {
    name: "v1",
    vals: {
      chrome: 2,
      canvas: 4.5,
      card: 7,
      modal: 9.5,
      popover: 12,
      border: 15,
    },
  },
  {
    name: "v2 (current)",
    vals: {
      chrome: 2,
      canvas: 6,
      card: 7.5,
      modal: 9,
      popover: 12,
      border: 15,
    },
  },
  {
    name: "pre-PR",
    vals: {
      chrome: 6.3,
      canvas: 3.5,
      card: 8.2,
      modal: 3.5,
      popover: 10.2,
      border: 10.5,
    },
  },
];

const MODES: Mode[] = ["dark", "light"];

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function fmtNum(n: number): string {
  return String(Math.round(n * 10) / 10);
}

// rem values: 4 decimals max, trailing zeros trimmed - exactly what lands in globals.css
function fmtRem(n: number): string {
  return String(parseFloat(n.toFixed(4)));
}

function fmtPx(rem: number): string {
  return String(parseFloat((rem * 16).toFixed(2)));
}

function parseTriplet(v: string): Triplet {
  const parts = (v || "").trim().split(/\s+/);
  if (parts.length >= 3) {
    const l = parseFloat(parts[parts.length - 1]);
    if (isFinite(l)) return { h: parts[0], s: parts[1], l };
  }
  return { h: "0", s: "0%", l: 0 };
}

function mod(n: number, m: number): number {
  return n - m * Math.floor(n / m);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s = s / 100;
  l = l / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = mod(h, 360) / 60;
  const x = c * (1 - Math.abs(mod(hp, 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

function relLum(rgb: [number, number, number]): number {
  const a = rgb.map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(
  t1: Triplet & { h: number | string },
  t2: Triplet & { h: number | string },
): number {
  const l1 = relLum(hslToRgb(Number(t1.h), Number(t1.s), t1.l));
  const l2 = relLum(hslToRgb(Number(t2.h), Number(t2.s), t2.l));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function contrastColor(ratio: number): string {
  if (ratio >= 4.5) return "rgb(120,220,140)";
  if (ratio >= 3) return "rgb(250,200,90)";
  return "rgb(255,118,118)";
}

/**
 * Mounts the Theme Lab panel. Idempotent: if the panel already exists, it is
 * re-shown and flashed instead of duplicated. Persisted overrides in
 * localStorage are re-applied on every mount, so the panel survives
 * navigations and reloads.
 */
export function mountThemeLab(): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  // Re-run guard: if the panel already exists, just re-show and flash it.
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.style.display = "";
    existing.style.boxShadow =
      "0 0 0 2px rgb(150,140,255), 0 8px 28px rgba(0,0,0,0.5)";
    setTimeout(() => {
      existing.style.boxShadow = "0 8px 28px rgba(0,0,0,0.5)";
    }, 600);
    return;
  }

  const MODE: Mode = root.classList.contains("dark") ? "dark" : "light";

  // Baseline = the stylesheet values, read with any inline override
  // temporarily removed.
  const baseline: Record<string, Triplet> = {};
  function captureBaseline(prop: string): void {
    const inline = root.style.getPropertyValue(prop);
    if (inline) root.style.removeProperty(prop);
    baseline[prop] = parseTriplet(
      getComputedStyle(root).getPropertyValue(prop),
    );
    if (inline) root.style.setProperty(prop, inline);
  }
  ALL.forEach((tier) => {
    tier.props.forEach(captureBaseline);
  });
  TEXT_TIERS.forEach((t) => {
    captureBaseline(t.prop);
  });

  function tripletFor(prop: string, l: number): string {
    const b = baseline[prop];
    return b.h + " " + b.s + " " + fmtNum(l) + "%";
  }

  const state: Record<string, number> = {};
  ALL.forEach((t) => {
    state[t.key] = baseline[t.props[0]].l;
  });

  const typo: {
    pairing: string;
    sizes: Record<string, number>;
    weights: Record<string, number | null>;
  } = { pairing: "default", sizes: {}, weights: {} };
  TYPE_TOKENS.forEach((t) => {
    typo.sizes[t.key] = t.def;
    typo.weights[t.key] = null; // null = default, no override
  });

  const textState: Record<string, number> = {};
  TEXT_TIERS.forEach((t) => {
    textState[t.key] = baseline[t.prop].l;
  });
  // Per-mode persisted text-color sets; only the set matching MODE is applied.
  let textColorsStore: Record<Mode, Record<string, number>> = {
    dark: {},
    light: {},
  };

  // UI element registries. Declared before the persisted-load block below
  // because applyTypography -> updateBoldHint can run before the panel DOM
  // is built (the standalone source relies on `var` hoisting for this).
  const inputs: Record<string, LadderRowEls> = {};
  const typoInputs: Record<string, TypoRowEls> = {};
  const textInputs: Record<string, TextRowEls> = {};
  const pairingRadios: Record<string, HTMLInputElement> = {};
  const gapEls: HTMLDivElement[] = [];
  let boldHint: HTMLSpanElement | null = null;

  function applyTier(t: Tier): void {
    t.props.forEach((prop) => {
      root.style.setProperty(prop, tripletFor(prop, state[t.key]));
    });
  }

  function isChanged(t: Tier): boolean {
    return Math.abs(state[t.key] - baseline[t.props[0]].l) > 0.001;
  }

  function typoSizeChanged(t: TypeToken): boolean {
    return Math.abs(typo.sizes[t.key] - t.def) > 0.001;
  }

  function typoWeightChanged(t: TypeToken): boolean {
    return typo.weights[t.key] !== null;
  }

  function typoRowChanged(t: TypeToken): boolean {
    return typoSizeChanged(t) || typoWeightChanged(t);
  }

  function applyTextTier(t: TextTier): void {
    root.style.setProperty(t.prop, tripletFor(t.prop, textState[t.key]));
  }

  function isTextChanged(t: TextTier): boolean {
    return Math.abs(textState[t.key] - baseline[t.prop].l) > 0.001;
  }

  function hslOfProp(prop: string, l: number): Triplet {
    const b = baseline[prop];
    return {
      h: String(parseFloat(b.h) || 0),
      s: String(parseFloat(b.s) || 0),
      l,
    };
  }

  function textContrast(t: TextTier): number {
    const fg = hslOfProp(t.prop, textState[t.key]);
    const bg = hslOfProp(t.vs, state[VS_LADDER_KEY[t.vs]]);
    return contrastRatio(fg, bg);
  }

  // ---------- typography engine: one managed style tag, never setProperty ----------

  // family match is exact (quotes stripped), never substring: "IBM Plex Mono"
  // must not satisfy a check for "IBM Plex Sans", and "Inter Fallback"
  // (next/font's metric fallback face) must not signal the real "Inter".
  function ensureFontLoaded(family: string, id: string, url: string): void {
    let has = false;
    try {
      document.fonts.forEach((f) => {
        if (String(f.family).replace(/["']/g, "").trim() === family) {
          has = true;
        }
      });
    } catch {
      has = false;
    }
    if (has || document.getElementById(id)) return;
    const head = document.head || root;
    if (!document.getElementById(PRECONNECT_ID)) {
      ["https://fonts.googleapis.com", "https://fonts.gstatic.com"].forEach(
        (href, i) => {
          const pc = document.createElement("link");
          if (i === 0) pc.id = PRECONNECT_ID;
          pc.rel = "preconnect";
          pc.href = href;
          if (i === 1) pc.crossOrigin = "anonymous";
          head.appendChild(pc);
        },
      );
    }
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = url;
    head.appendChild(link);
  }

  // Shows the applied --font-weight-bold next to the pairing radios; safe to
  // call before the panel UI exists (load-time applyTypography).
  function updateBoldHint(): void {
    if (!boldHint) return;
    let v = "";
    try {
      v = (
        root.style.getPropertyValue("--font-weight-bold") ||
        getComputedStyle(root).getPropertyValue("--font-weight-bold")
      ).trim();
    } catch {
      v = "";
    }
    boldHint.textContent = "bold: " + (v || "default");
  }

  function applyTypography(): void {
    let css = "";
    if (typo.pairing === "plex") {
      ensureFontLoaded("IBM Plex Sans", PLEX_SANS_CSS_ID, PLEX_SANS_URL);
      ensureFontLoaded("IBM Plex Mono", PLEX_MONO_CSS_ID, PLEX_MONO_URL);
      css +=
        'body, .font-sans { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif !important; }\n';
      css +=
        '.font-mono, code, pre, kbd, samp { font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace !important; }\n';
    } else if (typo.pairing === "inter") {
      ensureFontLoaded("Inter", INTER_CSS_ID, INTER_URL);
      css +=
        'body, .font-sans { font-family: "Inter", ui-sans-serif, system-ui, sans-serif !important; }\n';
    }
    // fair bold comparison: force --font-weight-bold per pairing; the last
    // action (pairing selection) wins over any earlier bold override
    const pairing = PAIRINGS.find((p) => p.val === typo.pairing);
    if (pairing && pairing.bold) {
      root.style.setProperty("--font-weight-bold", pairing.bold);
    } else {
      root.style.removeProperty("--font-weight-bold");
    }
    updateBoldHint();
    TYPE_TOKENS.forEach((t) => {
      const decls: string[] = [];
      if (typoSizeChanged(t)) {
        decls.push(
          "font-size: " + fmtRem(typo.sizes[t.key]) + "rem !important",
        );
      }
      if (typoWeightChanged(t)) {
        decls.push("font-weight: " + typo.weights[t.key] + " !important");
      }
      if (decls.length) {
        css += ".text-" + t.key + " { " + decls.join("; ") + "; }\n";
      }
    });
    let tag = document.getElementById(TYPO_STYLE_ID);
    if (!css) {
      if (tag) tag.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement("style");
      tag.id = TYPO_STYLE_ID;
      (document.head || root).appendChild(tag);
    }
    tag.textContent = css;
  }

  function save(): void {
    const out: SavedOut = {};
    let any = false;
    ALL.forEach((t) => {
      if (isChanged(t)) {
        out[t.key] = state[t.key];
        any = true;
      }
    });
    if (typo.pairing !== "default") {
      out.typo = out.typo || {};
      out.typo.pairing = typo.pairing;
      any = true;
    }
    TYPE_TOKENS.forEach((t) => {
      if (typoSizeChanged(t)) {
        out.typo = out.typo || {};
        out.typo.sizes = out.typo.sizes || {};
        out.typo.sizes[t.key] = typo.sizes[t.key];
        any = true;
      }
      const w = typo.weights[t.key];
      if (w !== null) {
        out.typo = out.typo || {};
        out.typo.weights = out.typo.weights || {};
        out.typo.weights[t.key] = w;
        any = true;
      }
    });
    // text colors: current mode from live state, other mode passed through
    const cur: Record<string, number> = {};
    TEXT_TIERS.forEach((t) => {
      if (isTextChanged(t)) cur[t.key] = textState[t.key];
    });
    textColorsStore[MODE] = cur;
    MODES.forEach((m) => {
      if (Object.keys(textColorsStore[m]).length) {
        out.textColors = out.textColors || {};
        out.textColors[m] = textColorsStore[m];
        any = true;
      }
    });
    try {
      if (any) localStorage.setItem(LS_KEY, JSON.stringify(out));
      else localStorage.removeItem(LS_KEY);
    } catch {
      // storage unavailable: overrides still applied inline
    }
  }

  // Re-apply persisted overrides (panel survives page navigations when
  // re-injected).
  (function loadPersisted(): void {
    let saved: Persisted | null = null;
    try {
      saved = JSON.parse(
        localStorage.getItem(LS_KEY) || "null",
      ) as Persisted | null;
    } catch {
      saved = null;
    }
    if (saved && typeof saved === "object") {
      ALL.forEach((t) => {
        const v = saved[t.key];
        if (typeof v === "number" && isFinite(v)) {
          state[t.key] = Math.min(30, Math.max(0, v));
          applyTier(t);
        }
      });
      const tp = saved.typo;
      if (tp && typeof tp === "object") {
        // migrate legacy "system" to "default"; accept only known values
        const pv = tp.pairing === "system" ? "default" : tp.pairing;
        if (pv === "inter" || pv === "plex") typo.pairing = pv;
        if (tp.sizes && typeof tp.sizes === "object") {
          TYPE_TOKENS.forEach((t) => {
            const raw = tp.sizes?.[t.key];
            if (typeof raw === "number" && isFinite(raw)) {
              // values > 8 are legacy px persistence; migrate to rem
              const rem = raw > 8 ? raw / 16 : raw;
              typo.sizes[t.key] = Math.min(2.5, Math.max(0.5, rem));
            }
          });
        }
        if (tp.weights && typeof tp.weights === "object") {
          TYPE_TOKENS.forEach((t) => {
            const v = tp.weights?.[t.key];
            if (typeof v === "number" && WEIGHTS.indexOf(v) !== -1) {
              typo.weights[t.key] = v;
            }
          });
        }
        applyTypography();
      }
      const tc = saved.textColors;
      if (tc && typeof tc === "object") {
        MODES.forEach((m) => {
          const set = tc[m];
          if (set && typeof set === "object") {
            TEXT_TIERS.forEach((t) => {
              const v = set[t.key];
              if (typeof v === "number" && isFinite(v)) {
                textColorsStore[m][t.key] = Math.min(100, Math.max(0, v));
              }
            });
          }
        });
        // only the set matching the page's current mode is applied
        TEXT_TIERS.forEach((t) => {
          const v = textColorsStore[MODE][t.key];
          if (typeof v === "number") {
            textState[t.key] = v;
            applyTextTier(t);
          }
        });
      }
    }
  })();

  // ---------- panel UI ----------

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.style.cssText =
    "position:fixed;top:16px;right:16px;width:280px;z-index:2147483647;" +
    "background:rgb(28,28,30);color:rgb(238,238,238);border:1px solid rgb(60,60,66);" +
    "border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,0.5);" +
    "font:12px/1.4 system-ui,-apple-system,sans-serif;user-select:none;-webkit-user-select:none;";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;padding:7px 10px;" +
    "cursor:grab;border-bottom:1px solid rgb(60,60,66);border-radius:8px 8px 0 0;";
  const title = document.createElement("span");
  title.textContent = "theme lab";
  title.style.cssText =
    "font-weight:600;letter-spacing:0.02em;color:rgb(238,238,238);";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.title = "Close panel (keeps overrides applied)";
  closeBtn.style.cssText =
    "background:none;border:none;color:rgb(170,170,178);font-size:16px;line-height:1;" +
    "cursor:pointer;padding:0 2px;margin:0;";
  closeBtn.addEventListener("click", () => {
    panel.remove();
  });
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.cssText = "padding:8px 10px 10px;";
  panel.appendChild(body);

  function makeSection(titleText: string, open: boolean): HTMLDetailsElement {
    const d = document.createElement("details");
    if (open) d.open = true;
    const s = document.createElement("summary");
    s.textContent = titleText;
    s.style.cssText =
      "cursor:pointer;color:rgb(205,205,212);font-size:11px;font-weight:600;" +
      "letter-spacing:0.03em;margin:2px 0 3px;";
    d.appendChild(s);
    return d;
  }

  function makeRow(t: Tier): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0;";

    const label = document.createElement("span");
    label.textContent = t.label;
    label.title = t.props.join(", ");
    label.style.cssText =
      "width:56px;flex:none;color:rgb(198,198,205);white-space:nowrap;" +
      "overflow:hidden;text-overflow:ellipsis;font-size:11px;";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "30";
    slider.step = "0.1";
    slider.style.cssText =
      "flex:1;min-width:0;margin:0;accent-color:rgb(150,140,255);cursor:pointer;";

    const num = document.createElement("input");
    num.type = "number";
    num.min = "0";
    num.max = "30";
    num.step = "0.1";
    num.style.cssText =
      "width:50px;flex:none;background:rgb(44,44,48);color:rgb(238,238,238);" +
      "border:1px solid rgb(72,72,78);border-radius:4px;padding:1px 4px;" +
      "font-family:" +
      MONO +
      ";font-size:11px;user-select:text;-webkit-user-select:text;";

    function commit(v: number): void {
      if (!isFinite(v)) return;
      v = Math.min(30, Math.max(0, v));
      state[t.key] = v;
      applyTier(t);
      save();
      updateGaps();
    }
    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      num.value = fmtNum(v);
      commit(v);
    });
    num.addEventListener("input", () => {
      const v = parseFloat(num.value);
      if (!isFinite(v)) return;
      slider.value = String(Math.min(30, Math.max(0, v)));
      commit(v);
    });
    num.addEventListener("change", () => {
      refresh(t); // normalize display after typing
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(num);
    inputs[t.key] = { slider, num };
    return row;
  }

  function refresh(t: Tier): void {
    const el = inputs[t.key];
    if (!el) return;
    el.slider.value = String(state[t.key]);
    el.num.value = fmtNum(state[t.key]);
  }

  // ---------- ladder section (expanded by default) ----------

  const ladderSection = makeSection("surface ladder", true);
  body.appendChild(ladderSection);

  TIERS.forEach((t, i) => {
    ladderSection.appendChild(makeRow(t));
    if (i < TIERS.length - 1) {
      const gap = document.createElement("div");
      gap.style.cssText =
        "text-align:right;font-family:" +
        MONO +
        ";font-size:10px;line-height:1.1;" +
        "padding:0 58px 0 0;margin:-1px 0;color:rgb(125,125,133);";
      ladderSection.appendChild(gap);
      gapEls.push(gap);
    }
  });

  function updateGaps(): void {
    gapEls.forEach((el, i) => {
      const below = state[TIERS[i].key];
      const above = state[TIERS[i + 1].key];
      const gap = above - below;
      const txt = (gap >= 0 ? "+" : "") + fmtNum(gap) + "pp";
      if (gap < 0) {
        el.textContent = txt + " order!";
        el.style.color = "rgb(255,118,118)";
        el.style.fontWeight = "700";
      } else if (gap < 1.5) {
        el.textContent = txt + " tight";
        el.style.color = "rgb(250,200,90)";
        el.style.fontWeight = "600";
      } else {
        el.textContent = txt;
        el.style.color = "rgb(125,125,133)";
        el.style.fontWeight = "400";
      }
    });
    // --background / --sidebar-background moved: refresh text contrast too
    updateTextContrast();
  }

  // Secondary tokens, collapsed by default.
  const extrasDetails = document.createElement("details");
  const extrasSummary = document.createElement("summary");
  extrasSummary.textContent = "secondary tokens";
  extrasSummary.style.cssText =
    "cursor:pointer;color:rgb(160,160,168);font-size:11px;margin:6px 0 2px;";
  extrasDetails.appendChild(extrasSummary);
  EXTRAS.forEach((t) => {
    extrasDetails.appendChild(makeRow(t));
  });
  ladderSection.appendChild(extrasDetails);

  // ---------- buttons ----------

  function makeBtn(
    text: string,
    titleText: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (titleText) b.title = titleText;
    b.style.cssText =
      "background:rgb(56,56,62);color:rgb(230,230,236);border:1px solid rgb(78,78,84);" +
      "border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;flex:1;min-width:0;";
    b.addEventListener("click", onClick);
    return b;
  }

  const presetRow = document.createElement("div");
  presetRow.style.cssText = "display:flex;gap:5px;margin-top:6px;";
  PRESETS.forEach((p) => {
    presetRow.appendChild(
      makeBtn(p.name, "Apply preset: " + JSON.stringify(p.vals), () => {
        applyPreset(p.vals);
      }),
    );
  });
  ladderSection.appendChild(presetRow);

  function applyPreset(vals: Record<string, number>): void {
    TIERS.forEach((t) => {
      if (typeof vals[t.key] === "number") {
        state[t.key] = vals[t.key];
        applyTier(t);
        refresh(t);
      }
    });
    save();
    updateGaps();
  }

  // ---------- typography section (collapsed by default) ----------

  const typoSection = makeSection("typography", false);
  typoSection.style.marginTop = "6px";
  body.appendChild(typoSection);

  const pairingRow = document.createElement("div");
  pairingRow.style.cssText =
    "display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:2px 0 5px;" +
    "font-size:11px;color:rgb(198,198,205);";
  PAIRINGS.forEach((opt) => {
    const lab = document.createElement("label");
    lab.style.cssText =
      "display:flex;align-items:center;gap:4px;cursor:pointer;";
    const r = document.createElement("input");
    r.type = "radio";
    r.name = "theme-lab-pairing";
    r.value = opt.val;
    r.style.cssText = "margin:0;accent-color:rgb(150,140,255);cursor:pointer;";
    r.addEventListener("change", () => {
      if (!r.checked) return;
      typo.pairing = opt.val;
      applyTypography();
      save();
    });
    lab.appendChild(r);
    lab.appendChild(document.createTextNode(opt.label));
    pairingRadios[opt.val] = r;
    pairingRow.appendChild(lab);
  });
  boldHint = document.createElement("span");
  boldHint.title =
    "applied --font-weight-bold (forced per pairing; pairing selection wins)";
  boldHint.style.cssText =
    "margin-left:auto;color:rgb(130,130,138);font-family:" +
    MONO +
    ";font-size:9px;white-space:nowrap;";
  pairingRow.appendChild(boldHint);
  typoSection.appendChild(pairingRow);

  function markTypo(t: TypeToken): void {
    const el = typoInputs[t.key];
    if (!el) return;
    const changed = typoRowChanged(t);
    el.label.style.color = changed ? "rgb(178,168,255)" : "rgb(198,198,205)";
    el.label.style.fontWeight = changed ? "600" : "400";
  }

  function refreshTypo(t: TypeToken): void {
    const el = typoInputs[t.key];
    if (!el) return;
    el.slider.value = String(typo.sizes[t.key]);
    el.num.value = fmtRem(typo.sizes[t.key]);
    el.pxHint.textContent = fmtPx(typo.sizes[t.key]) + "px";
    const w = typo.weights[t.key];
    el.weight.value = w !== null ? String(w) : "";
    markTypo(t);
  }

  function makeTypeRow(t: TypeToken): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0;";

    const label = document.createElement("span");
    label.textContent = t.key + " (" + fmtRem(t.def) + ")";
    label.title = "--text-" + t.key + " (default " + fmtRem(t.def) + "rem)";
    label.style.cssText =
      "width:60px;flex:none;color:rgb(198,198,205);white-space:nowrap;" +
      "overflow:hidden;text-overflow:ellipsis;font-size:11px;";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0.5";
    slider.max = "2.5";
    slider.step = "0.025";
    slider.style.cssText =
      "flex:1;min-width:0;margin:0;accent-color:rgb(150,140,255);cursor:pointer;";

    const num = document.createElement("input");
    num.type = "number";
    num.min = "0.5";
    num.max = "2.5";
    num.step = "0.025";
    num.style.cssText =
      "width:50px;flex:none;background:rgb(44,44,48);color:rgb(238,238,238);" +
      "border:1px solid rgb(72,72,78);border-radius:4px;padding:1px 4px;" +
      "font-family:" +
      MONO +
      ";font-size:11px;user-select:text;-webkit-user-select:text;";

    // muted live px hint (rem * 16)
    const pxHint = document.createElement("span");
    pxHint.style.cssText =
      "width:36px;flex:none;color:rgb(130,130,138);font-family:" +
      MONO +
      ";font-size:9px;text-align:right;white-space:nowrap;";

    // font-weight picker; empty value = default (no override)
    const weight = document.createElement("select");
    weight.title = "font-weight override for .text-" + t.key;
    weight.style.cssText =
      "width:44px;flex:none;background:rgb(44,44,48);color:rgb(238,238,238);" +
      "border:1px solid rgb(72,72,78);border-radius:4px;padding:1px 2px;" +
      "font-family:" +
      MONO +
      ";font-size:10px;cursor:pointer;";
    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = "–"; // en dash
    weight.appendChild(defOpt);
    WEIGHTS.forEach((wv) => {
      const o = document.createElement("option");
      o.value = String(wv);
      o.textContent = String(wv);
      weight.appendChild(o);
    });
    weight.addEventListener("change", () => {
      typo.weights[t.key] =
        weight.value === "" ? null : parseInt(weight.value, 10);
      applyTypography();
      save();
      markTypo(t);
    });

    function commit(v: number): void {
      if (!isFinite(v)) return;
      v = Math.min(2.5, Math.max(0.5, v));
      typo.sizes[t.key] = v;
      pxHint.textContent = fmtPx(v) + "px";
      applyTypography();
      save();
      markTypo(t);
    }
    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      num.value = fmtRem(v);
      commit(v);
    });
    num.addEventListener("input", () => {
      const v = parseFloat(num.value);
      if (!isFinite(v)) return;
      slider.value = String(Math.min(2.5, Math.max(0.5, v)));
      commit(v);
    });
    num.addEventListener("change", () => {
      refreshTypo(t); // normalize display after typing
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(num);
    row.appendChild(pxHint);
    row.appendChild(weight);
    typoInputs[t.key] = { slider, num, label, pxHint, weight, defOpt };
    return row;
  }

  TYPE_TOKENS.forEach((t) => {
    typoSection.appendChild(makeTypeRow(t));
  });

  // Sample rendered font-weights per .text-* class on the live page. Weight is
  // not bound to the size token in code (font-* utilities are applied per
  // usage), so the dominant sampled weight is shown in the select's default
  // option: "- (400)" uniform, "- (400*)" mixed, plain "-" when no matches.
  function sampleWeights(): void {
    const DASH = "–";
    TYPE_TOKENS.forEach((t) => {
      const ui = typoInputs[t.key];
      if (!ui) return;
      let tally: Record<string, number> = {};
      let sampled = 0;
      try {
        const els = document.querySelectorAll(".text-" + t.key);
        for (let i = 0; i < els.length && sampled < 200; i++) {
          if (panel.contains(els[i])) continue;
          const fw = getComputedStyle(els[i]).fontWeight;
          if (!fw) continue;
          tally[fw] = (tally[fw] || 0) + 1;
          sampled++;
        }
      } catch {
        tally = {};
        sampled = 0;
      }
      const baseTitle = "font-weight override for .text-" + t.key;
      const keys = Object.keys(tally);
      if (!keys.length) {
        ui.defOpt.textContent = DASH;
        ui.weight.title = baseTitle + " (no .text-" + t.key + " on page)";
        return;
      }
      keys.sort((a, b) => tally[b] - tally[a]);
      const dominant = keys[0];
      const mixed = keys.length > 1;
      ui.defOpt.textContent = DASH + " (" + dominant + (mixed ? "*" : "") + ")";
      const parts = keys.map((k) => k + " ×" + tally[k]);
      ui.weight.title = baseTitle + " - sampled: " + parts.join(", ");
    });
  }

  const rescanBtn = document.createElement("button");
  rescanBtn.type = "button";
  rescanBtn.textContent = "rescan";
  rescanBtn.title = "Re-sample rendered font-weights per .text-* class";
  rescanBtn.style.cssText =
    "background:none;border:none;color:rgb(150,140,255);font-size:10px;" +
    "cursor:pointer;padding:0;margin-left:8px;text-decoration:underline;";
  rescanBtn.addEventListener("click", (e) => {
    e.preventDefault(); // keep the details section from toggling
    e.stopPropagation();
    sampleWeights();
  });
  const typoSummary = typoSection.querySelector("summary");
  if (typoSummary) typoSummary.appendChild(rescanBtn);

  // ---------- text colors section (collapsed by default) ----------

  const textSection = makeSection("text colors", false);
  textSection.style.marginTop = "6px";
  body.appendChild(textSection);

  function updateTextContrast(): void {
    TEXT_TIERS.forEach((t) => {
      const el = textInputs[t.key];
      if (!el) return;
      const ratio = textContrast(t);
      el.ratio.textContent = fmtNum(ratio) + ":1";
      el.ratio.style.color = contrastColor(ratio);
    });
  }

  function refreshText(t: TextTier): void {
    const el = textInputs[t.key];
    if (!el) return;
    el.slider.value = String(textState[t.key]);
    el.num.value = fmtNum(textState[t.key]);
  }

  function makeTextRow(t: TextTier): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0;";

    const label = document.createElement("span");
    label.textContent = t.label;
    label.title =
      t.prop + " vs " + t.vs + ", sampled in " + MODE + " mode (" + MODE + ")";
    label.style.cssText =
      "width:56px;flex:none;color:rgb(198,198,205);white-space:nowrap;" +
      "overflow:hidden;text-overflow:ellipsis;font-size:11px;";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "0.1";
    slider.style.cssText =
      "flex:1;min-width:0;margin:0;accent-color:rgb(150,140,255);cursor:pointer;";

    const num = document.createElement("input");
    num.type = "number";
    num.min = "0";
    num.max = "100";
    num.step = "0.1";
    num.style.cssText =
      "width:46px;flex:none;background:rgb(44,44,48);color:rgb(238,238,238);" +
      "border:1px solid rgb(72,72,78);border-radius:4px;padding:1px 4px;" +
      "font-family:" +
      MONO +
      ";font-size:11px;user-select:text;-webkit-user-select:text;";

    // live WCAG contrast against the row's surface
    const ratio = document.createElement("span");
    ratio.title = "WCAG contrast ratio " + t.prop + " vs " + t.vs;
    ratio.style.cssText =
      "width:36px;flex:none;font-family:" +
      MONO +
      ";font-size:9px;text-align:right;white-space:nowrap;";

    function commit(v: number): void {
      if (!isFinite(v)) return;
      v = Math.min(100, Math.max(0, v));
      textState[t.key] = v;
      applyTextTier(t);
      save();
      updateTextContrast();
    }
    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      num.value = fmtNum(v);
      commit(v);
    });
    num.addEventListener("input", () => {
      const v = parseFloat(num.value);
      if (!isFinite(v)) return;
      slider.value = String(Math.min(100, Math.max(0, v)));
      commit(v);
    });
    num.addEventListener("change", () => {
      refreshText(t); // normalize display after typing
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(num);
    row.appendChild(ratio);
    textInputs[t.key] = { slider, num, label, ratio };
    return row;
  }

  TEXT_TIERS.forEach((t) => {
    textSection.appendChild(makeTextRow(t));
  });

  // ---------- global actions ----------

  function resetAll(): void {
    ALL.forEach((t) => {
      t.props.forEach((prop) => {
        root.style.removeProperty(prop);
      });
      state[t.key] = baseline[t.props[0]].l;
      refresh(t);
    });
    typo.pairing = "default";
    TYPE_TOKENS.forEach((t) => {
      typo.sizes[t.key] = t.def;
      typo.weights[t.key] = null;
      refreshTypo(t);
    });
    pairingRadios["default"].checked = true;
    root.style.removeProperty("--font-weight-bold");
    updateBoldHint();
    const tag = document.getElementById(TYPO_STYLE_ID);
    if (tag) tag.remove();
    TEXT_TIERS.forEach((t) => {
      root.style.removeProperty(t.prop);
      textState[t.key] = baseline[t.prop].l;
      refreshText(t);
    });
    textColorsStore = { dark: {}, light: {} };
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // noop
    }
    updateGaps();
  }

  function flash(btn: HTMLButtonElement, text: string): void {
    const orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => {
      btn.textContent = orig;
    }, 1200);
  }

  function copyCss(btn: HTMLButtonElement): void {
    const lines: string[] = [];
    ALL.forEach((t) => {
      if (isChanged(t)) {
        t.props.forEach((prop) => {
          lines.push(prop + ": " + tripletFor(prop, state[t.key]) + ";");
        });
      }
    });
    const typoLines: string[] = [];
    TYPE_TOKENS.forEach((t) => {
      if (typoSizeChanged(t)) {
        typoLines.push(
          "--text-" + t.key + ": " + fmtRem(typo.sizes[t.key]) + "rem;",
        );
      }
      if (typoWeightChanged(t)) {
        // weights are not globals.css tokens today, so note them as comments
        typoLines.push(
          "/* text-" + t.key + ": weight " + typo.weights[t.key] + " */",
        );
      }
    });
    if (typoLines.length || typo.pairing !== "default") {
      if (lines.length) lines.push("");
      lines.push("/* typography (Tailwind @theme inline text tokens) */");
      typoLines.forEach((l) => {
        lines.push(l);
      });
      if (typo.pairing !== "default") {
        PAIRINGS.forEach((p) => {
          if (p.val === typo.pairing) {
            lines.push("/* pairing: " + p.label + " (bold " + p.bold + ") */");
          }
        });
      }
    }
    const textLines: string[] = [];
    TEXT_TIERS.forEach((t) => {
      if (isTextChanged(t)) {
        textLines.push(
          t.prop + ": " + tripletFor(t.prop, textState[t.key]) + ";",
        );
      }
    });
    if (textLines.length) {
      if (lines.length) lines.push("");
      lines.push("/* text colors (" + MODE + ") */");
      textLines.forEach((l) => {
        lines.push(l);
      });
    }
    if (!lines.length) {
      flash(btn, "no changes");
      return;
    }
    const text = lines.join("\n");
    // Intentional divergence from the standalone source: no execCommand
    // fallback (deprecated API). This dev-only panel always runs on
    // localhost, a secure context where the async Clipboard API exists.
    navigator.clipboard.writeText(text).then(
      () => {
        flash(btn, "copied " + lines.length);
      },
      () => {
        flash(btn, "copy failed");
      },
    );
  }

  const actionRow = document.createElement("div");
  actionRow.style.cssText = "display:flex;gap:5px;margin-top:8px;";
  actionRow.appendChild(
    makeBtn(
      "Reset",
      "Clear all overrides (ladder, typography, text colors) and persisted values",
      resetAll,
    ),
  );
  const copyBtn = makeBtn(
    "Copy CSS",
    "Copy changed tokens as globals.css lines",
    () => {
      copyCss(copyBtn);
    },
  );
  actionRow.appendChild(copyBtn);
  body.appendChild(actionRow);

  // ---------- drag by header ----------

  header.addEventListener("pointerdown", (e) => {
    if (e.target === closeBtn) return;
    const rect = panel.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    panel.style.right = "auto";
    header.style.cursor = "grabbing";
    function move(ev: PointerEvent): void {
      panel.style.left = ev.clientX - dx + "px";
      panel.style.top = ev.clientY - dy + "px";
    }
    function up(): void {
      header.style.cursor = "grab";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  });

  // ---------- mount ----------

  ALL.forEach(refresh);
  TYPE_TOKENS.forEach(refreshTypo);
  TEXT_TIERS.forEach(refreshText);
  pairingRadios[typo.pairing].checked = true;
  updateBoldHint();
  updateGaps(); // also refreshes text contrast
  sampleWeights();
  (document.body || root).appendChild(panel);
}
