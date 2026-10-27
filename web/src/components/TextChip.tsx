import { Badge } from "@/src/components/design-system/Badge/Badge";

/**
 * Quiet text-only chip for page and peek headers: no fill and muted text so it
 * doesn't compete with the title next to it.
 */
export function TextChip({ text }: { text: string }) {
  return <Badge color="primary" size="md" text={text} />;
}
