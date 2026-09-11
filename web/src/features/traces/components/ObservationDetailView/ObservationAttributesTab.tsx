/**
 * Attributes tab: the three fact tables an observation carries, in one place.
 * Preview keeps showing them under Output; this tab exists for observations
 * whose input and output push the tables a long scroll away.
 */

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MetadataFilterActions } from "@/src/components/table/ValueCell";

// Same wrappers Preview uses for these tables, so both tabs line up: one
// `space-y-4` stack, no top margin on the first section.
const SECTION_CLASS =
  "[&_.io-message-content]:px-3 [&_.io-message-header]:px-3";

export function ObservationAttributesTab({
  attributes,
  attributesAnchorTime,
  modelParameters,
  metadata,
  projectId,
  currentView,
}: {
  attributes: Record<string, unknown>;
  attributesAnchorTime: Date;
  modelParameters: Record<string, unknown> | null;
  metadata: unknown;
  projectId: string;
  /** Same table / raw JSON switch the Preview honours, so the two agree. */
  currentView: "pretty" | "json";
}) {
  const metadataActions: MetadataFilterActions = {
    projectId,
    filterTarget: "observations",
  };
  const hasAttributes = Object.keys(attributes).length > 0;
  const hasMetadata =
    metadata !== null &&
    metadata !== undefined &&
    !(typeof metadata === "object" && Object.keys(metadata).length === 0);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto pb-4">
      <div className="space-y-4 pt-2">
        {hasAttributes ? (
          <div className={SECTION_CLASS}>
            <PrettyJsonView
              hideHeader
              title="Attributes"
              json={attributes}
              currentView={currentView}
              metadataActions={{
                ...metadataActions,
                attributes: { anchorTime: attributesAnchorTime },
                analyticsTable: "attributes",
              }}
              hoverControls
            />
          </div>
        ) : null}
        {modelParameters ? (
          <div className={SECTION_CLASS}>
            <PrettyJsonView
              hideHeader
              title="Model parameters"
              json={modelParameters}
              currentView={currentView}
              metadataActions={{
                ...metadataActions,
                copyOnly: true,
                analyticsTable: "model_parameters",
              }}
              hoverControls
            />
          </div>
        ) : null}
        {hasMetadata ? (
          <div className={SECTION_CLASS}>
            <PrettyJsonView
              hideHeader
              title="Metadata"
              json={metadata}
              currentView={currentView}
              metadataActions={{
                ...metadataActions,
                analyticsTable: "metadata",
              }}
              hoverControls
            />
          </div>
        ) : null}
        {!hasAttributes && !modelParameters && !hasMetadata ? (
          <p className="text-muted-foreground px-3 text-sm">
            No attributes, model parameters or metadata on this observation.
          </p>
        ) : null}
      </div>
    </div>
  );
}
