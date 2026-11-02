import {
  Download,
  FileText,
  Loader2,
  MoreVertical,
  TrashIcon,
} from "@langfuse/icons";

import { HeaderActionButton } from "@/src/components/HeaderActionButton";
import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";
import { HeaderActionMenuRows } from "@/src/components/HeaderActionMenuRows";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { useShareMenuItems } from "@/src/components/useShareMenuItems";
import { InternalFeatureBadge } from "@/src/features/feature-flags";
import { ConnectedDetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import { DeleteTraceDialogController } from "@/src/features/traces/components/DeleteTraceDialogController";
import { TraceTranscriptDialogController } from "@/src/features/traces/components/TraceTranscriptDialogController";
import { staleProps } from "@/src/features/traces/fns/staleProps";
import { useDownloadTraceAsJson } from "@/src/features/traces/hooks/useDownloadTraceAsJson";
import { type useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";
import { cn } from "@/src/utils/tailwind";

type TraceDetailData = NonNullable<
  ReturnType<typeof useTraceDetailData>["data"]
>;

type TraceDetailActionsLayout = "toolbar" | "menu";

type TraceDetailActionsProps = {
  /** Undefined while the trace loads: the actions render disabled in place. */
  trace: TraceDetailData | undefined;
  traceContext: "fullscreen" | "peek";
  shareUrl?: string;
  timestamp?: Date;
  deleteRedirectUrl?: string;
  onAfterDelete?: (deletedTraceId: string) => void;
  layout?: TraceDetailActionsLayout;
  /** `trace` is the previous trace, kept while the next one loads. */
  isPlaceholderData?: boolean;
};

/**
 * Trace-level header actions shared by the peek and the standalone trace page.
 *
 * `layout="toolbar"` (default) renders the icon row: Download JSON plus a kebab
 * holding Make Public, Copy trace ID, Copy trace name and Delete. `layout="menu"`
 * renders the same actions as full-width labeled rows for the mobile header
 * menu.
 *
 * Delete always targets the whole trace. Behavior differs only by surface:
 * - **page**: pass `deleteRedirectUrl` → navigates to the list after delete.
 * - **peek**: pass `onAfterDelete` (e.g. `closePeek`) → closes in place. It
 *   receives the deleted trace id so the peek can stay open if K/J-navigation
 *   already moved on to another trace. We invalidate broadly because the peek
 *   is hosted over many different lists, each backed by a different query.
 */
export function TraceDetailActions({
  trace,
  layout = "toolbar",
  isPlaceholderData = false,
  ...props
}: TraceDetailActionsProps) {
  if (!trace) return <DisabledTraceDetailActions layout={layout} />;
  const { key, ...stale } = staleProps(isPlaceholderData, {
    remountOnStale: true,
  });
  return (
    <TraceTranscriptDialogController
      key={key}
      projectId={trace.projectId}
      traceId={trace.id}
      timestamp={trace.timestamp}
    >
      {({ openDialog }) => (
        <LoadedTraceDetailActions
          trace={trace}
          layout={layout}
          stale={stale}
          onShowTranscript={openDialog}
          {...props}
        />
      )}
    </TraceTranscriptDialogController>
  );
}

function DisabledTraceDetailActions({
  layout,
}: {
  layout: TraceDetailActionsLayout;
}) {
  const downloadIcon = <Download size="base" />;

  if (layout === "menu") {
    return (
      <div className="flex w-full flex-col gap-0.5">
        <HeaderActionMenuRow
          label="Download JSON"
          icon={downloadIcon}
          disabled
        />
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center gap-1">
      <HeaderActionButton label="Download JSON" icon={downloadIcon} disabled />
      <HeaderActionButton
        label="More actions"
        icon={<MoreVertical size="base" />}
        disabled
      />
    </div>
  );
}

function LoadedTraceDetailActions({
  trace,
  traceContext,
  shareUrl,
  timestamp,
  deleteRedirectUrl,
  onAfterDelete,
  layout,
  stale,
  onShowTranscript,
}: Omit<TraceDetailActionsProps, "trace" | "layout" | "isPlaceholderData"> & {
  trace: TraceDetailData;
  layout: TraceDetailActionsLayout;
  stale: Omit<ReturnType<typeof staleProps>, "key">;
  onShowTranscript?: () => void;
}) {
  const shareItems = useShareMenuItems({
    kind: "trace",
    projectId: trace.projectId,
    objectId: trace.id,
    isPublic: trace.public,
    shareUrl,
    timestamp,
  });
  const [handleDownload, isDownloading] = useDownloadTraceAsJson({
    trace,
    observations: trace.observations,
    traceContext,
  });

  const idItems = [
    { id: trace.id, name: "trace ID" },
    ...(trace.name ? [{ id: trace.name, name: "trace name" }] : []),
  ];

  const downloadIcon = isDownloading ? (
    <Loader2 size="base" __rawClassName="animate-spin" />
  ) : (
    <Download size="base" />
  );

  return (
    <DeleteTraceDialogController
      projectId={trace.projectId}
      traceId={trace.id}
      traceName={trace.name}
      redirectUrl={deleteRedirectUrl}
      onAfterDelete={onAfterDelete}
    >
      {({ disabled: deleteDisabled, openDialog: openDeleteDialog }) => (
        <ConnectedDetailHeaderActionsMenuController
          idItems={idItems}
          projectId={trace.projectId}
          renderMenu={(copyItems) => {
            const items: DropdownMenuItemDefinition[] = [
              ...shareItems,
              ...copyItems,
              ...(onShowTranscript
                ? [
                    {
                      type: "item" as const,
                      id: "show-trace-transcript",
                      title: "Show trace transcript",
                      icon: FileText,
                      badge: <InternalFeatureBadge />,
                      onClick: onShowTranscript,
                    },
                  ]
                : []),
              { id: "delete-separator", type: "separator" },
              {
                type: "item",
                id: "delete",
                title: "Delete",
                icon: TrashIcon,
                variant: "destructive",
                disabled: deleteDisabled,
                onClick: openDeleteDialog,
              },
            ];

            if (layout === "menu") {
              return (
                <div
                  inert={stale.inert}
                  className={cn(
                    "flex w-full flex-col gap-0.5",
                    stale.className,
                  )}
                >
                  <HeaderActionMenuRow
                    label="Download JSON"
                    icon={downloadIcon}
                    disabled={isDownloading}
                    onClick={() => handleDownload()}
                  />
                  <HeaderActionMenuRows items={items} />
                </div>
              );
            }

            return (
              <div
                inert={stale.inert}
                className={cn(
                  "flex flex-row items-center gap-1",
                  stale.className,
                )}
              >
                <HeaderActionButton
                  label="Download JSON"
                  icon={downloadIcon}
                  disabled={isDownloading}
                  onClick={() => handleDownload()}
                />
                <DropdownMenu items={items} placement="bottom-end">
                  {({ getTriggerProps }) => (
                    <HeaderActionButton
                      label="More actions"
                      icon={<MoreVertical size="base" />}
                      {...getTriggerProps()}
                    />
                  )}
                </DropdownMenu>
              </div>
            );
          }}
        />
      )}
    </DeleteTraceDialogController>
  );
}
