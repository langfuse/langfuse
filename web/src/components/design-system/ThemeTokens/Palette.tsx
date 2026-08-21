/**
 * Storybook-only palette reference (Design → Palette Lab): the picked
 * PRIMITIVE layer for the next-generation token architecture — Tailwind v4
 * palettes, verbatim (values extracted from tailwindcss/theme.css, which
 * defines them in OKLCH natively).
 *
 * The picks (token-architecture RFC, primitives layer):
 * - Neutral:  `neutral` in light mode · `stone` in dark mode
 * - Brand:    `indigo`
 * - Dataviz:  `indigo`, `yellow`, `teal`, `sky` (set of 6 — two slots open)
 * - Status:   `red`, `amber`, `emerald`, `blue`
 *
 * Presentation follows clickhouse.design/brand/color: one full-bleed strip
 * per family with the step numbers in a footer band, prose-led sections,
 * theme-aware chrome (the strips sit on the page background under the
 * Storybook light/dark toggle). Hover a swatch for its OKLCH value.
 *
 * Nothing here is wired to `globals.css` — this page is for review only.
 * (Today `neutral`, `stone`, `indigo` and `sky` are even disabled built-ins
 * there; wiring re-enables them later, behind semantic tokens.)
 */
import { type ReactNode, useState } from "react";

import { DocsPageHeader, DocsSection } from "./docsChrome";

export const STEP_NAMES = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const;

export type Family = {
  /** Tailwind palette name, e.g. `neutral`, `red`. */
  name: string;
  /** Role note rendered after the family name, e.g. `error`. */
  role?: string;
  /** Raw Tailwind v4 oklch triplets, steps 50 → 950. */
  steps: string[];
};

/* ------------------------------------------------------------------------- *
 * The picked primitives — Tailwind v4 values, verbatim (theme.css).
 * ------------------------------------------------------------------------- */

export const NEUTRAL: Family = {
  name: "neutral",
  role: "light theme",
  steps: [
    "98.5% 0 0",
    "97% 0 0",
    "92.2% 0 0",
    "87% 0 0",
    "70.8% 0 0",
    "55.6% 0 0",
    "43.9% 0 0",
    "37.1% 0 0",
    "26.9% 0 0",
    "20.5% 0 0",
    "14.5% 0 0",
  ],
};

export const STONE: Family = {
  name: "stone",
  role: "dark theme",
  steps: [
    "98.5% 0.001 106.423",
    "97% 0.001 106.424",
    "92.3% 0.003 48.717",
    "86.9% 0.005 56.366",
    "70.9% 0.01 56.259",
    "55.3% 0.013 58.071",
    "44.4% 0.011 73.639",
    "37.4% 0.01 67.558",
    "26.8% 0.007 34.298",
    "21.6% 0.006 56.043",
    "14.7% 0.004 49.25",
  ],
};

const INDIGO: Family = {
  name: "indigo",
  steps: [
    "96.2% 0.018 272.314",
    "93% 0.034 272.788",
    "87% 0.065 274.039",
    "78.5% 0.115 274.713",
    "67.3% 0.182 276.935",
    "58.5% 0.233 277.117",
    "51.1% 0.262 276.966",
    "45.7% 0.24 277.023",
    "39.8% 0.195 277.366",
    "35.9% 0.144 278.697",
    "25.7% 0.09 281.288",
  ],
};

const YELLOW: Family = {
  name: "yellow",
  steps: [
    "98.7% 0.026 102.212",
    "97.3% 0.071 103.193",
    "94.5% 0.129 101.54",
    "90.5% 0.182 98.111",
    "85.2% 0.199 91.936",
    "79.5% 0.184 86.047",
    "68.1% 0.162 75.834",
    "55.4% 0.135 66.442",
    "47.6% 0.114 61.907",
    "42.1% 0.095 57.708",
    "28.6% 0.066 53.813",
  ],
};

const TEAL: Family = {
  name: "teal",
  steps: [
    "98.4% 0.014 180.72",
    "95.3% 0.051 180.801",
    "91% 0.096 180.426",
    "85.5% 0.138 181.071",
    "77.7% 0.152 181.912",
    "70.4% 0.14 182.503",
    "60% 0.118 184.704",
    "51.1% 0.096 186.391",
    "43.7% 0.078 188.216",
    "38.6% 0.063 188.416",
    "27.7% 0.046 192.524",
  ],
};

const SKY: Family = {
  name: "sky",
  steps: [
    "97.7% 0.013 236.62",
    "95.1% 0.026 236.824",
    "90.1% 0.058 230.902",
    "82.8% 0.111 230.318",
    "74.6% 0.16 232.661",
    "68.5% 0.169 237.323",
    "58.8% 0.158 241.966",
    "50% 0.134 242.749",
    "44.3% 0.11 240.79",
    "39.1% 0.09 240.876",
    "29.3% 0.066 243.157",
  ],
};

export const RED: Family = {
  name: "red",
  role: "error",
  steps: [
    "97.1% 0.013 17.38",
    "93.6% 0.032 17.717",
    "88.5% 0.062 18.334",
    "80.8% 0.114 19.571",
    "70.4% 0.191 22.216",
    "63.7% 0.237 25.331",
    "57.7% 0.245 27.325",
    "50.5% 0.213 27.518",
    "44.4% 0.177 26.899",
    "39.6% 0.141 25.723",
    "25.8% 0.092 26.042",
  ],
};

const AMBER: Family = {
  name: "amber",
  role: "warning",
  steps: [
    "98.7% 0.022 95.277",
    "96.2% 0.059 95.617",
    "92.4% 0.12 95.746",
    "87.9% 0.169 91.605",
    "82.8% 0.189 84.429",
    "76.9% 0.188 70.08",
    "66.6% 0.179 58.318",
    "55.5% 0.163 48.998",
    "47.3% 0.137 46.201",
    "41.4% 0.112 45.904",
    "27.9% 0.077 45.635",
  ],
};

const EMERALD: Family = {
  name: "emerald",
  role: "success",
  steps: [
    "97.9% 0.021 166.113",
    "95% 0.052 163.051",
    "90.5% 0.093 164.15",
    "84.5% 0.143 164.978",
    "76.5% 0.177 163.223",
    "69.6% 0.17 162.48",
    "59.6% 0.145 163.225",
    "50.8% 0.118 165.612",
    "43.2% 0.095 166.913",
    "37.8% 0.077 168.94",
    "26.2% 0.051 172.552",
  ],
};

const BLUE: Family = {
  name: "blue",
  role: "info",
  steps: [
    "97% 0.014 254.604",
    "93.2% 0.032 255.585",
    "88.2% 0.059 254.128",
    "80.9% 0.105 251.813",
    "70.7% 0.165 254.624",
    "62.3% 0.214 259.815",
    "54.6% 0.245 262.881",
    "48.8% 0.243 264.376",
    "42.4% 0.199 265.638",
    "37.9% 0.146 265.522",
    "28.2% 0.091 267.935",
  ],
};

/* ------------------------------------------------------------------------- *
 * The clickhouse.design strip: family name, one full-bleed run of swatches,
 * step numbers in a footer band. Hover a swatch for `name-step · oklch(…)`;
 * click it to copy the oklch value.
 * ------------------------------------------------------------------------- */

/** Legible check-mark ink on top of an arbitrary swatch. */
const inkFor = (raw: string) =>
  parseFloat(raw) > 55 ? "oklch(0.22 0 0)" : "oklch(1 0 0)";

function FamilyStrip({ family }: { family: Family }) {
  const [copiedStep, setCopiedStep] = useState<string | null>(null);

  const copy = (step: string, raw: string) => {
    navigator.clipboard.writeText(`oklch(${raw})`).catch(() => {
      /* clipboard unavailable (permissions/insecure context) — feedback still shows */
    });
    setCopiedStep(step);
    window.setTimeout(
      () => setCopiedStep((current) => (current === step ? null : current)),
      1200,
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-foreground text-sm font-bold">
        {family.name}
        {family.role && (
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            · {family.role}
          </span>
        )}
      </h3>
      <div className="overflow-hidden rounded-md border">
        <div className="flex">
          {family.steps.map((raw, index) => {
            const step = STEP_NAMES[index];
            return (
              <button
                key={step}
                type="button"
                onClick={() => copy(step, raw)}
                title={`${family.name}-${step} · oklch(${raw}) · click to copy`}
                aria-label={`Copy oklch(${raw})`}
                className="ring-ring flex h-12 flex-1 cursor-pointer items-center justify-center font-mono text-[10px] focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                style={{ background: `oklch(${raw})` }}
              >
                {copiedStep === step && (
                  <span aria-hidden style={{ color: inkFor(raw) }}>
                    copied
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="bg-muted flex border-t">
          {STEP_NAMES.map((step) => (
            <span
              key={step}
              className="text-muted-foreground flex-1 py-1.5 text-center font-mono text-[10px]"
            >
              {step}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StripSection({
  title,
  blurb,
  families,
}: {
  title: string;
  blurb: ReactNode;
  families: Family[];
}) {
  return (
    <DocsSection title={title} blurb={blurb}>
      <div className="flex flex-col gap-6">
        {families.map((family) => (
          <FamilyStrip key={`${family.name}-${family.role}`} family={family} />
        ))}
      </div>
    </DocsSection>
  );
}

/* ------------------------------------------------------------------------- *
 * Page.
 * ------------------------------------------------------------------------- */

export function Palette() {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <DocsPageHeader eyebrow="Design tokens · primitives" title="Color" />
        <StripSection
          title="Neutral"
          blurb="Text, backgrounds and strokes. Neutral in light mode, stone in dark."
          families={[NEUTRAL, STONE]}
        />
        <StripSection
          title="Interactive"
          blurb="Interactive elements and things that need to call for attention."
          families={[INDIGO]}
        />
        <StripSection
          title="Dataviz"
          blurb="Used for widgets and all visualisations across the app."
          families={[INDIGO, YELLOW, TEAL, SKY]}
        />
        <StripSection
          title="Status"
          blurb="Used in badges, statuses and tags."
          families={[RED, AMBER, EMERALD, BLUE]}
        />
      </div>
    </div>
  );
}
