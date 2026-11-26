import { cn } from "@/src/utils/tailwind";

/**
 * Props for the root of content that belongs to the previous item while the
 * next one loads: dimmed, and `inert` so it takes no pointer, keyboard or focus
 * input. `inert` does not reach portalled menus and dialogs; `remountOnStale`
 * flips `key` so they close. Set `key` directly, React rejects it in a spread.
 */
export function staleProps(
  stale: boolean,
  { remountOnStale = false }: { remountOnStale?: boolean } = {},
) {
  return {
    key: remountOnStale && stale ? "stale" : "live",
    inert: stale,
    className: cn(stale && "pointer-events-none opacity-60 select-none"),
  };
}
