import { Badge } from "@/src/components/ui/badge";

export function InternalFeatureBadge() {
  return (
    <Badge
      variant="outline"
      className="shrink-0 border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-500/50 dark:bg-orange-500/20 dark:text-orange-300"
    >
      Internal
    </Badge>
  );
}
