import { Badge } from "@/src/components/ui/badge";

export function InternalFeatureBadge() {
  return (
    <Badge
      variant="outline"
      className="border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200"
    >
      Internal
    </Badge>
  );
}
