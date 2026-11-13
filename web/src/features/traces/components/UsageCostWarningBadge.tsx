import { TriangleAlert } from "@langfuse/icons";
import { Metric } from "@/src/components/design-system/Metric/Metric";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";

export function UsageCostWarningBadge({
  projectId,
  label,
  description,
}: {
  projectId: string;
  label: "no cost" | "usage not submitted";
  description: string;
}) {
  return (
    <CustomTooltip
      content={
        <div className="flex flex-col gap-1">
          <p className="text-xs">{description}</p>
          <div className="flex items-center gap-1.5">
            <TextLink
              path={`/project/${encodeURIComponent(projectId)}/settings/models`}
              value="Model settings"
            />
            <span className="text-muted-foreground text-xs">·</span>
            <TextLink
              path="https://langfuse.com/docs/observability/features/token-and-cost-tracking#ingest-usage-and-cost-manually"
              value="Docs"
              external
            />
          </div>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} className="inline-flex" tabIndex={0}>
          <Metric
            interactive
            icon={TriangleAlert}
            iconTone="warning"
            value={label}
          />
        </span>
      )}
    </CustomTooltip>
  );
}
