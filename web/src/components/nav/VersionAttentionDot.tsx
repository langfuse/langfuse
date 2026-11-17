import { cn } from "@/src/utils/tailwind";

const tones = {
  major: "bg-dark-red",
  minor: "bg-category-amber",
  patch: "bg-muted-foreground",
  migration: "bg-dark-blue",
} as const;

/** A small status dot on the version badge and in its menu: an available update or a running background migration. */
export function VersionAttentionDot({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof tones;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("size-1.5 shrink-0 rounded-full", tones[tone])}
    />
  );
}
