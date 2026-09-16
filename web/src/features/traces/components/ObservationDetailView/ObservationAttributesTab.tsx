/**
 * Attributes tab: the three fact tables an observation carries, in one place.
 * Preview is input and output only — these tables used to sit below the output,
 * which on a large observation is a long scroll away.
 */

import { useMemo } from "react";

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MetadataFilterActions } from "@/src/components/table/ValueCell";
import { LargeJsonFieldFallback } from "@/src/features/traces/components/IOPreview/components/LargeJsonFieldFallback";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  probeJsonField,
} from "@/src/features/traces/components/IOPreview/fns/jsonViewSizeGate";

// Same wrappers Preview uses for these tables, so both tabs line up.
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
  /** Already parsed by Preview's worker; reused so the tab never re-parses. */
  parsedMetadata?: unknown;
  observationId: string;
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
  // Same gate Preview applies: PrettyJsonView is unvirtualized, so a multi-MB
  // payload freezes the tab. Above the limit show the bounded fallback.
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
