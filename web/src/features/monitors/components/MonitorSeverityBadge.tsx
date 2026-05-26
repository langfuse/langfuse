import { PauseCircle } from "lucide-react";

import { Badge, type BadgeProps } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";
import { type MonitorSeverity } from "@langfuse/shared/monitors";

/** severityVariant maps each MonitorSeverity to the underlying Badge variant. */
const severityVariant: Record<MonitorSeverity, BadgeProps["variant"]> = {
  UNKNOWN: "outline",
  NO_DATA: "secondary",
  PAUSED: "outline",
  OK: "default",
  WARNING: "default",
  ALERT: "default",
};

/** severityClassName maps each MonitorSeverity to its badge tailwind classes. */
const severityClassName: Record<MonitorSeverity, string> = {
  UNKNOWN: "text-gray-400",
  NO_DATA: "",
  PAUSED: "text-gray-400",
  OK: "bg-emerald-500 text-white hover:bg-emerald-500",
  WARNING: "bg-amber-600 text-white hover:bg-amber-600",
  ALERT: "bg-orange-600 text-white hover:bg-orange-600",
};

/** severityLabel maps each MonitorSeverity to its display text. */
const severityLabel: Record<MonitorSeverity, string> = {
  UNKNOWN: "PENDING",
  NO_DATA: "NO DATA",
  PAUSED: "PAUSED",
  OK: "OK",
  WARNING: "WARNING",
  ALERT: "ALERT",
};

/** MonitorSeverityBadge renders a Monitor's current severity as a Badge, with a pause icon for PAUSED and a spinner for UNKNOWN. */
export function MonitorSeverityBadge({
  severity,
  className,
}: {
  severity: MonitorSeverity;
  className?: string;
}) {
  return (
    <Badge
      variant={severityVariant[severity]}
      className={cn(
        "w-20 justify-center py-1",
        severityClassName[severity],
        className,
      )}
    >
      {severity === "PAUSED" ? (
        <span className="inline-flex items-center gap-1">
          <PauseCircle className="h-4 w-4" />
          {severityLabel.PAUSED}
        </span>
      ) : severity === "UNKNOWN" ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-400"
            aria-hidden="true"
          />
          {severityLabel.UNKNOWN}
        </span>
      ) : (
        severityLabel[severity]
      )}
    </Badge>
  );
}
