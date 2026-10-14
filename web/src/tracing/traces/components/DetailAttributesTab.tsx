/** Trace metadata, or observation attributes, model parameters and metadata. */

import { useMemo } from "react";
import { type MediaReturnType } from "@/src/tracing/media";

import { PrettyJsonView } from "@/src/app/design-system/legacy-primitives/PrettyJsonView";
import { cn } from "@/src/app/utils/tailwind";
import { IO_SECTIONS_FLUSH_CLASS } from "@/src/tracing/traces/constants/ioSectionClasses";
import { type MetadataFilterActions } from "@/src/app/tables/common-components/ValueCell";
import { AttributeRowActions } from "./ObservationDetailView/AttributeRowActions";
import { LargeJsonFieldFallback } from "@/src/tracing/traces/components/IOPreview/components/LargeJsonFieldFallback";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  probeJsonField,
} from "@/src/tracing/traces/components/IOPreview/fns/jsonViewSizeGate";

export function DetailAttributesTab({
  observation,
  metadata,
  parsedMetadata,
  objectId,
  projectId,
  currentView,
  media,
  metadataExpansionState,
  onMetadataExpansionChange,
  jsonMetadataExpanded,
  onJsonMetadataExpandedChange,
}: {
  observation?: {
    attributes: Record<string, unknown>;
    attributesAnchorTime: Date;
    modelParameters: Record<string, unknown> | null;
  };
  metadata: unknown;
  /** Avoids re-parsing. */
  parsedMetadata?: unknown;
  objectId: string;
  projectId: string;
  currentView: "pretty" | "json";
  media?: MediaReturnType[];
  metadataExpansionState?: Record<string, boolean>;
  onMetadataExpansionChange?: (expansion: Record<string, boolean>) => void;
  jsonMetadataExpanded?: boolean;
  onJsonMetadataExpandedChange?: (expanded: boolean) => void;
}) {
  const metadataActions: MetadataFilterActions = {
    projectId,
    filterTarget: observation ? "observations" : "traces",
  };
  const hasAttributes =
    observation && Object.keys(observation.attributes).length > 0;
  const hasMetadata =
    metadata !== null &&
    metadata !== undefined &&
    !(typeof metadata === "object" && Object.keys(metadata).length === 0);
  // PrettyJsonView is unvirtualized; oversized payloads get the fallback.
  const metadataProbe = useMemo(() => probeJsonField(metadata), [metadata]);
  const metadataTooLarge = metadataProbe.size > JSON_VIEW_RENDER_CHAR_LIMIT;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto px-4 pb-4">
      <div className={cn("space-y-3 pt-3", IO_SECTIONS_FLUSH_CLASS)}>
        {observation && hasAttributes ? (
          <PrettyJsonView
            title="Attributes"
            json={observation.attributes}
            currentView={currentView}
            rowActions={(row) => (
              <AttributeRowActions
                row={row}
                projectId={projectId}
                filterTarget="observations"
                anchorTime={observation.attributesAnchorTime}
                analyticsTable="attributes"
              />
            )}
          />
        ) : null}
        {observation?.modelParameters ? (
          <PrettyJsonView
            title="Model parameters"
            json={observation.modelParameters}
            currentView={currentView}
          />
        ) : null}
        {hasMetadata ? (
          <div>
            {metadataTooLarge ? (
              <LargeJsonFieldFallback
                title="Metadata"
                serialized={metadataProbe.serialized}
                isString={metadataProbe.isString}
                charCount={metadataProbe.size}
                downloadFileBase={`metadata-${objectId}`}
              />
            ) : (
              <PrettyJsonView
                title="Metadata"
                json={metadata}
                parsedJson={parsedMetadata}
                currentView={currentView}
                metadataActions={metadataActions}
                media={media?.filter(
                  (attachment) => attachment.field === "metadata",
                )}
                externalExpansionState={
                  currentView === "pretty"
                    ? metadataExpansionState
                    : jsonMetadataExpanded
                }
                onExternalExpansionChange={(expansion) => {
                  if (typeof expansion === "boolean") {
                    onJsonMetadataExpandedChange?.(expansion);
                    return;
                  }
                  onMetadataExpansionChange?.(expansion);
                }}
              />
            )}
          </div>
        ) : null}
        {!hasAttributes && !observation?.modelParameters && !hasMetadata ? (
          <p className="text-muted-foreground text-base">
            {observation
              ? "No attributes, model parameters or metadata on this observation."
              : "No metadata on this trace."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
