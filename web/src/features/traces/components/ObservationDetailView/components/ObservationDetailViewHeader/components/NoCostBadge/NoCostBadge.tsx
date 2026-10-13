import { TriangleAlert } from "lucide-react";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";

const MODEL_PRICES_DOCS_URL =
  "https://langfuse.com/docs/observability/features/token-and-cost-tracking#custom-model-definitions";

/** Fills the cost slot of a generation that has tokens but no cost. */
export function NoCostBadge() {
  return (
    <CustomTooltip
      content={
        <p className="text-xs">
          No model price matched this generation. Add a model price, or send the
          cost from your SDK.{" "}
          <a
            className="text-link hover:text-link-hover underline"
            href={MODEL_PRICES_DOCS_URL}
            target="_blank"
            rel="noopener"
          >
            Learn more
          </a>
        </p>
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
