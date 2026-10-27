import { cva } from "class-variance-authority";

const glyphVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md leading-none font-bold uppercase select-none",
  {
    variants: {
      size: {
        sm: "size-5 text-[0.625rem]",
        md: "size-7 text-xs",
      },
      tone: {
        blue: "bg-light-blue text-dark-blue",
        green: "bg-light-green text-dark-green",
        yellow: "bg-light-yellow text-dark-yellow",
        violet: "bg-light-violet text-dark-violet",
      },
    },
  },
);

const TONES = ["blue", "green", "yellow", "violet"] as const;

/** Stable per id, so a project keeps its color everywhere it is listed. */
function toneFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
  return TONES[hash % TONES.length];
}

/** Decorative initial tile for a project or organization; the name is always shown next to it. */
export function WorkspaceGlyph({
  id,
  name,
  size,
}: {
  id: string;
  name: string;
  size: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={glyphVariants({ size, tone: toneFor(id) })}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}
