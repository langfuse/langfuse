/** Attributes, model parameters and metadata as three tables. */

import { useMemo } from "react";

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MetadataFilterActions } from "@/src/components/table/ValueCell";
import { LargeJsonFieldFallback } from "@/src/features/traces/components/IOPreview/components/LargeJsonFieldFallback";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  probeJsonField,
} from "@/src/features/traces/components/IOPreview/fns/jsonViewSizeGate";

// Matches Preview's table wrappers.
const SECTION_CLASS =
  "[&_.io-message-content]:px-3 [&_.io-message-header]:px-3";

export function ObservationAttributesTab({
  attributes,
  modelParameters,
  metadata,
  parsedMetadata,
  observationId,
  projectId,
  currentView,
}: {
  attributes: Record<string, unknown>;
  modelParameters: Record<string, unknown> | null;
  metadata: unknown;
  /** Reused from Preview so the tab never re-parses. */
  parsedMetadata?: unknown;
  observationId: string;
  projectId: string;
  /** Shared with Preview's table / JSON switch. */
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
  // PrettyJsonView is unvirtualized; oversized payloads get the fallback.
  const metadataProbe = useMemo(() => probeJsonField(metadata), [metadata]);
  const metadataTooLarge = metadataProbe.size > JSON_VIEW_RENDER_CHAR_LIMIT;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto pb-4">
      <div className="space-y-4 pt-2">
        {hasAttributes ? (
          <div className={SECTION_CLASS}>
            <PrettyJsonView
              showHeader={false}
              title="Attributes"
              json={attributes}
              currentView={currentView}
              metadataActions={metadataActions}
              hoverControls
            />
          </div>
        ) : null}
        {modelParameters ? (
          <div className={SECTION_CLASS}>
            <PrettyJsonView
              showHeader={false}
              title="Model parameters"
              json={modelParameters}
              currentView={currentView}
              hoverControls
            />
          </div>
        ) : null}
        {hasMetadata ? (
          <div className={SECTION_CLASS}>
            {metadataTooLarge ? (
              <LargeJsonFieldFallback
                title="Metadata"
                serialized={metadataProbe.serialized}
                isString={metadataProbe.isString}
                charCount={metadataProbe.size}
                downloadFileBase={`metadata-${observationId}`}
              />
            ) : (
              <PrettyJsonView
                showHeader={false}
                title="Metadata"
                json={metadata}
                parsedJson={parsedMetadata}
                currentView={currentView}
                metadataActions={metadataActions}
                hoverControls
              />
            )}
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
