import { Badge } from "@/src/app/design-system/legacy-primitives/badge";

/**
 * Quiet text-only chip for page and peek headers: no fill and muted text so it
 * doesn't compete with the title next to it.
 */
export function TextChip({ text }: { text: string }) {
  return (
    <Badge
      variant="outline"
      title={text}
      className="text-muted-foreground border-border flex max-w-fit items-center overflow-hidden border bg-transparent px-1 whitespace-nowrap"
    >
      <span className="truncate" title={text}>
        {text}
      </span>
    </Badge>
  );
}
