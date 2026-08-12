// CIP fork feature (see FORK.md): Draft / Open / Closed badge.
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";
import { type ElicitationStatus } from "../lib/contract";

const STATUS_STYLES: Record<ElicitationStatus, string> = {
  draft: "bg-muted text-muted-foreground hover:bg-muted",
  open: "bg-light-green text-dark-green hover:bg-light-green",
  closed: "bg-light-red text-dark-red hover:bg-light-red",
};

const STATUS_LABELS: Record<ElicitationStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export function ElicitationStatusBadge({
  status,
  className,
}: {
  status: ElicitationStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-none", STATUS_STYLES[status], className)}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
