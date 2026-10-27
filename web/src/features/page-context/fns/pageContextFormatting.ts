import {
  PAGE_CONTEXT_LIMITS,
  type PageContextFact,
  type PageContextSnapshot,
} from "@/src/features/page-context/types";

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function fact(
  key: string,
  label: string,
  display: string,
  value?: number | string,
): PageContextFact {
  return {
    key,
    label,
    display: truncateText(display, PAGE_CONTEXT_LIMITS.factDisplay),
    ...(value === undefined
      ? {}
      : {
          value:
            typeof value === "string"
              ? truncateText(value, PAGE_CONTEXT_LIMITS.factValue)
              : value,
        }),
  };
}

/** "GENERATION" → "Generation". */
export function formatEntityTypeLabel(type: string): string {
  const lower = type.toLowerCase().replace(/[_-]+/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Drops the least important detail until the snapshot fits the serialized
 * budget: related entities first, then the focus, then trailing facts.
 */
export function fitPageContextSnapshot(
  snapshot: PageContextSnapshot,
): PageContextSnapshot {
  const fits = (candidate: PageContextSnapshot) =>
    JSON.stringify(candidate).length <= PAGE_CONTEXT_LIMITS.serializedLength;

  let candidate = snapshot;
  while (!fits(candidate)) {
    if (candidate.related && candidate.related.length > 0) {
      candidate = { ...candidate, related: candidate.related.slice(0, -1) };
    } else if (candidate.focus) {
      const { focus: _focus, ...rest } = candidate;
      candidate = rest;
    } else if (candidate.facts.length > 0) {
      candidate = { ...candidate, facts: candidate.facts.slice(0, -1) };
    } else {
      return { ...candidate, title: truncateText(candidate.title, 40) };
    }
  }
  return candidate;
}
