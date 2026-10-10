/** Stored skill references, attributes, model parameters and metadata. */

import { useMemo } from "react";
import {
  type SkillsAvailable,
  type SkillsResourceLoaded,
} from "@langfuse/shared";

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";
import { cn } from "@/src/utils/tailwind";
import { IO_SECTIONS_FLUSH_CLASS } from "@/src/features/traces/constants/ioSectionClasses";
import { type MetadataFilterActions } from "@/src/components/table/ValueCell";
import { AttributeRowActions } from "./AttributeRowActions";
import { LargeJsonFieldFallback } from "@/src/features/traces/components/IOPreview/components/LargeJsonFieldFallback";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  probeJsonField,
} from "@/src/features/traces/components/IOPreview/fns/jsonViewSizeGate";

export function ObservationAttributesTab({
  attributes,
  attributesAnchorTime,
  skillsAvailable = [],
  skillsResourceLoaded = [],
  modelParameters,
  metadata,
  parsedMetadata,
  observationId,
  projectId,
  currentView,
}: {
  attributes: Record<string, unknown>;
  attributesAnchorTime: Date;
  skillsAvailable?: SkillsAvailable;
  skillsResourceLoaded?: SkillsResourceLoaded;
  modelParameters: Record<string, unknown> | null;
  metadata: unknown;
  /** Avoids re-parsing. */
  parsedMetadata?: unknown;
  observationId: string;
  projectId: string;
  currentView: "pretty" | "json";
}) {
  const metadataActions: MetadataFilterActions = {
    projectId,
    filterTarget: "observations",
  };
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  const hasSkills =
    internalFeaturesEnabled &&
    (skillsAvailable.length > 0 || skillsResourceLoaded.length > 0);
  const hasAttributes = Object.keys(attributes).length > 0;
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
        {hasAttributes ? (
          <PrettyJsonView
            title="Attributes"
            json={attributes}
            currentView={currentView}
            rowActions={(row) => (
              <AttributeRowActions
                row={row}
                projectId={projectId}
                filterTarget="observations"
                anchorTime={attributesAnchorTime}
                analyticsTable="attributes"
              />
            )}
          />
        ) : null}
        {modelParameters ? (
          <PrettyJsonView
            title="Model parameters"
            json={modelParameters}
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
                downloadFileBase={`metadata-${observationId}`}
              />
            ) : (
              <PrettyJsonView
                title="Metadata"
                json={metadata}
                parsedJson={parsedMetadata}
                currentView={currentView}
                metadataActions={metadataActions}
              />
            )}
          </div>
        ) : null}
        {hasSkills ? (
          <>
            <PrettyJsonView
              title="Available skills"
              json={skillsAvailable}
              currentView={currentView}
            />
            <PrettyJsonView
              title="Loaded resources"
              json={skillsResourceLoaded}
              currentView={currentView}
            />
          </>
        ) : null}
        {!hasSkills && !hasAttributes && !modelParameters && !hasMetadata ? (
          <p className="text-muted-foreground text-base">
            No attributes, model parameters or metadata on this observation.
          </p>
        ) : null}
      </div>
    </div>
  );
}
