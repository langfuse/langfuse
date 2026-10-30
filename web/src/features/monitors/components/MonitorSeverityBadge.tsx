/* eslint-disable @repo/no-style-props */
import { cn } from "@/src/utils/tailwind";
import { type MonitorSeverity } from "@langfuse/shared/monitors";

const badgeBaseClassName =
  "inline-flex h-5.5 items-center gap-1.5 rounded-sm border pr-1.5 pl-2 text-xs leading-none font-normal transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2";

/** severityVariantClassName maps each MonitorSeverity to its base badge chrome. */
const severityVariantClassName: Record<MonitorSeverity, string> = {
  UNKNOWN: "border-border text-foreground-secondary",
  NO_DATA:
    "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  PAUSED:
    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
  OK: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
  WARNING:
    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
  ALERT:
    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
};

/** severityClassName maps each MonitorSeverity to its badge tailwind classes. */
const severityClassName: Record<MonitorSeverity, string> = {
  UNKNOWN: "text-gray-400",
  NO_DATA: "",
  PAUSED: "bg-gray-500 text-white hover:bg-gray-500",
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

/** MonitorSeverityBadge displays the Monitor's severity, including loading states for pending monitors. */
export function MonitorSeverityBadge({
  severity,
  className,
}: {
  severity: MonitorSeverity;
  className?: string;
}) {
  return (
    <div
      className={cn(
        badgeBaseClassName,
        severityVariantClassName[severity],
        "w-20 justify-center py-1",
        severityClassName[severity],
        className,
      )}
    >
      {severity === "UNKNOWN" ? (
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
    </div>
  );
}
