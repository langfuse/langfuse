/** Trace metadata, or observation attributes, model parameters and metadata. */

import { JsonViewController } from "@/src/components/ui/JsonViewController";
import { FoldVertical, UnfoldVertical } from "@langfuse/icons";
import { useMemo } from "react";
import { useRouter } from "next/router";
import { type MediaReturnType } from "@/src/features/media";

import { PrettyJsonViewContent } from "@/src/components/ui/PrettyJsonViewContent";
import { getJsonViewContentKind } from "@/src/components/ui/fns/getJsonViewContentKind";
import { IOSection } from "@/src/components/ui/IOSection";
import { cn } from "@/src/utils/tailwind";
import { IO_STICKY_HEADERS_CLASS } from "@/src/features/traces/constants/ioSectionClasses";
import { getMetadataRowActions } from "@/src/features/traces/fns/getMetadataRowActions";
import { getAttributeRowActions } from "@/src/features/traces/fns/getAttributeRowActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { LargeJsonFieldFallback } from "@/src/features/traces/components/IOPreview/components/LargeJsonFieldFallback";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  probeJsonField,
} from "@/src/features/traces/components/IOPreview/fns/jsonViewSizeGate";

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
  const router = useRouter();
  const capture = usePostHogClientCapture();
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
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col overflow-auto px-4 pb-4",
        IO_STICKY_HEADERS_CLASS,
      )}
    >
      <div className="space-y-2 pt-3">
        {observation && hasAttributes ? (
          <JsonViewController
            json={observation.attributes}
            currentView={currentView}
          >
            {(state) => (
              <IOSection
                title="Attributes"
                onCopy={state.copy}
                actions={
                  getJsonViewContentKind(state) === "table" &&
                  state.hasExpandableRows
                    ? [
                        {
                          icon: state.allRowsExpanded
                            ? FoldVertical
                            : UnfoldVertical,
                          label: state.allRowsExpanded
                            ? "Collapse all rows"
                            : "Expand all rows",
                          onClick: state.toggleAllRows,
                        },
                      ]
                    : undefined
                }
                variant={
                  getJsonViewContentKind(state) === "table" ? "table" : "text"
                }
              >
                <PrettyJsonViewContent
                  state={state}
                  title="Attributes"
                  borderless
                  rowActions={(row) =>
                    getAttributeRowActions({
                      row,
                      projectId,
                      filterTarget: "observations",
                      anchorTime: observation.attributesAnchorTime,
                      analyticsTable: "attributes",
                      router,
                      capture,
                    })
                  }
                />
              </IOSection>
            )}
          </JsonViewController>
        ) : null}
        {observation?.modelParameters ? (
          <JsonViewController
            json={observation.modelParameters}
            currentView={currentView}
          >
            {(state) => (
              <IOSection
                title="Model parameters"
                onCopy={state.copy}
                actions={
                  getJsonViewContentKind(state) === "table" &&
                  state.hasExpandableRows
                    ? [
                        {
                          icon: state.allRowsExpanded
                            ? FoldVertical
                            : UnfoldVertical,
                          label: state.allRowsExpanded
                            ? "Collapse all rows"
                            : "Expand all rows",
                          onClick: state.toggleAllRows,
                        },
                      ]
                    : undefined
                }
                variant={
                  getJsonViewContentKind(state) === "table" ? "table" : "text"
                }
              >
                <PrettyJsonViewContent
                  state={state}
                  title="Model parameters"
                  borderless
                />
              </IOSection>
            )}
          </JsonViewController>
        ) : null}
        {hasMetadata ? (
          <div>
            {metadataTooLarge ? (
              <IOSection title="Metadata">
                <LargeJsonFieldFallback
                  title="Metadata"
                  hideTitle
                  serialized={metadataProbe.serialized}
                  isString={metadataProbe.isString}
                  charCount={metadataProbe.size}
                  downloadFileBase={`metadata-${objectId}`}
                />
              </IOSection>
            ) : (
              <JsonViewController
                json={metadata}
                parsedJson={parsedMetadata}
                media={media?.filter(
                  (attachment) => attachment.field === "metadata",
                )}
                currentView={currentView}
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
              >
                {(state) => (
                  <IOSection
                    title="Metadata"
                    onCopy={state.copy}
                    actions={
                      getJsonViewContentKind(state) === "table" &&
                      state.hasExpandableRows
                        ? [
                            {
                              icon: state.allRowsExpanded
                                ? FoldVertical
                                : UnfoldVertical,
                              label: state.allRowsExpanded
                                ? "Collapse all rows"
                                : "Expand all rows",
                              onClick: state.toggleAllRows,
                            },
                          ]
                        : undefined
                    }
                    variant={
                      getJsonViewContentKind(state) === "table"
                        ? "table"
                        : "text"
                    }
                  >
                    <PrettyJsonViewContent
                      state={state}
                      title="Metadata"
                      borderless
                      rowActions={(row) =>
                        getMetadataRowActions({
                          row,
                          projectId,
                          filterTarget: observation ? "observations" : "traces",
                          router,
                        })
                      }
                    />
                  </IOSection>
                )}
              </JsonViewController>
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
