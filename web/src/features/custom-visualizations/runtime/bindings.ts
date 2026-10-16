import type { ComputedFunction } from "@json-render/core";

export const CUSTOM_UI_COMPUTED_FUNCTIONS = [
  "count",
  "formatDuration",
  "formatNumber",
  "lineCount",
  "percent",
  "titleCase",
  "truncate",
] as const;

export type CustomUiComputedFunction =
  (typeof CUSTOM_UI_COMPUTED_FUNCTIONS)[number];

const finiteNumber = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const text = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

export const customUiComputedFunctions: Record<
  CustomUiComputedFunction,
  ComputedFunction
> = {
  count: ({ value }) => {
    if (Array.isArray(value) || typeof value === "string") return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
    return 0;
  },
  formatDuration: ({ value }) => {
    const milliseconds = finiteNumber(value);
    if (milliseconds === undefined) return "";
    if (Math.abs(milliseconds) < 1_000) return `${milliseconds.toFixed(0)} ms`;
    return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 2 : 1)} s`;
  },
  formatNumber: ({ value }) => {
    const number = finiteNumber(value);
    return number === undefined
      ? ""
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
          number,
        );
  },
  lineCount: ({ value }) => {
    const content = text(value);
    return content.length === 0 ? 0 : content.split(/\r?\n/u).length;
  },
  percent: ({ value }) => {
    const number = finiteNumber(value);
    if (number === undefined) return "";
    const normalized = Math.abs(number) <= 1 ? number * 100 : number;
    return `${normalized.toFixed(Math.abs(normalized) < 10 ? 1 : 0)}%`;
  },
  titleCase: ({ value }) =>
    text(value)
      .replaceAll(/[_-]+/gu, " ")
      .replaceAll(/\b\p{L}/gu, (character) => character.toUpperCase()),
  truncate: ({ value, maxCharacters }) => {
    const content = text(value);
    const maximum = Math.min(
      2_000,
      Math.max(20, finiteNumber(maxCharacters) ?? 160),
    );
    return content.length <= maximum
      ? content
      : `${content.slice(0, maximum - 1)}…`;
  },
};

export const isAllowedComputedFunction = (
  value: unknown,
): value is CustomUiComputedFunction =>
  typeof value === "string" &&
  CUSTOM_UI_COMPUTED_FUNCTIONS.some((name) => name === value);
