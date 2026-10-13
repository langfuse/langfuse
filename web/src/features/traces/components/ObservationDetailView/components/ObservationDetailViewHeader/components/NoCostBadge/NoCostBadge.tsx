import { TriangleAlert } from "lucide-react";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";

/** Fills the cost slot of a generation that has tokens but no cost. */
export function NoCostBadge({ projectId }: { projectId: string }) {
  return (
    <CustomTooltip
      content={
        <div className="flex flex-col gap-1">
          <p className="text-xs">
            No model price matched this generation. Add a model price, or send
            the cost from your SDK.
          </p>
          <TextLink
            path={`/project/${encodeURIComponent(projectId)}/settings/models`}
            value="Model settings"
          />
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} className="inline-flex" tabIndex={0}>
          <Badge
            font="mono"
            color="ghost"
            interactive
            leadingIcon={TriangleAlert}
            text="no cost"
          />
        </span>
      )}
    </CustomTooltip>
  );
}
