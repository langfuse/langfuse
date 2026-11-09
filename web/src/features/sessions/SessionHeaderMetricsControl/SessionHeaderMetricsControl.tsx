import { useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { Plus } from "@langfuse/icons";
import { assertUnreachable } from "@/src/utils/types";
import { type HeaderMetric } from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { getSessionHeaderMetrics } from "@/src/features/sessions/fns/getSessionHeaderMetrics";
import {
  getMetadataJsonPathLabel,
  resolveMetadataJsonPath,
  type FirstVisibleObservationMetadataState,
  type SessionMetadataJsonPathState,
} from "@/src/features/sessions/sessionMetadataJsonPath";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/design-system/Button/Button";
import { Label } from "@/src/components/ui/label";
import { FloatingController } from "@/src/components/design-system/FloatingController/FloatingController";

function resolveAgainstSource(
  source: FirstVisibleObservationMetadataState,
  path: string,
) {
  if (source.state === "ready")
    return resolveMetadataJsonPath(source.metadata, path);
  const syntax = resolveMetadataJsonPath({}, path);
  if (syntax.state === "invalid") return syntax;
  return source;
}

function MetadataEditor({
  metadataJsonPaths,
  onClose,
  onSave,
}: {
  metadataJsonPaths: SessionMetadataJsonPathState;
  onClose: () => void;
  onSave: (path: string) => void;
}) {
  const [draftPath, setDraftPath] = useState("");
  const path = draftPath.trim();
  const resolution = resolveAgainstSource(metadataJsonPaths.source, path);
  const isDuplicate = metadataJsonPaths.paths.includes(path);
  const isValid =
    path.length > 0 && resolution.state !== "invalid" && !isDuplicate;
  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) return;
    onSave(path);
    onClose();
  };
  const preview = (() => {
    if (!path) return "Enter a JSONPath to preview metadata.";
    if (isDuplicate) return "This JSONPath is already shown.";
    if (resolution.state === "match") return resolution.displayValue;
    if (resolution.state === "invalid") return resolution.message;
    if (resolution.state === "loading" || resolution.state === "idle")
      return "Loading first visible observation…";
    if (resolution.state === "error")
      return "Could not load the first visible observation.";
    if (resolution.state === "empty")
      return "No observation matches the current view.";
    if (resolution.state === "no-match")
      return "No match on the first visible observation.";
    return assertUnreachable(resolution);
  })();
  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="session-metadata-jsonpath">Metadata JSONPath</Label>
        <Input
          id="session-metadata-jsonpath"
          value={draftPath}
          onChange={(event) => setDraftPath(event.target.value)}
          placeholder="$.langfuse_user_email"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="bg-muted/40 flex min-h-14 flex-col gap-1 rounded-md border p-2 text-xs">
        <span className="text-muted-foreground font-bold">Preview</span>
        <span className="font-mono break-all">{preview}</span>
        {metadataJsonPaths.source.state === "ready" &&
          metadataJsonPaths.source.metadataTruncated && (
            <span className="text-amber-600 dark:text-amber-500">
              Metadata is truncated in this session preview.
            </span>
          )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          text="Cancel"
          onClick={onClose}
        />
        <Button type="submit" size="sm" text="Save" disabled={!isValid} />
      </div>
    </form>
  );
}

export function SessionHeaderMetricsControl({
  projectId,
  countTraces,
  minTimestamp,
  maxTimestamp,
  tokensIn,
  tokensOut,
  totalTokens,
  totalCost,
  users,
  scores,
  metadataJsonPaths,
  children,
}: {
  projectId: string;
  countTraces: number;
  minTimestamp: Date;
  maxTimestamp: Date;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  totalCost: number;
  users: readonly string[];
  scores: Parameters<typeof getSessionHeaderMetrics>[0]["scores"];
  metadataJsonPaths: SessionMetadataJsonPathState;
  children: (metrics: HeaderMetric[]) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const [isEditorOpen, setEditorOpen] = useState(false);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const handleEditorOpenChange = (open: boolean) => {
    if (open && document.activeElement instanceof HTMLElement) {
      editorTriggerRef.current = document.activeElement;
    }
    setEditorOpen(open);
    metadataJsonPaths.onEditorOpenChange(open);
  };
  const handleSave = (path: string) => {
    metadataJsonPaths.onSave(path);
    capture("session_detail:metadata_jsonpath_config_changed", {
      action: "add",
      configuredPathCount: metadataJsonPaths.paths.length + 1,
      isV4: true,
    });
  };
  const metrics = getSessionHeaderMetrics({
    projectId,
    countTraces,
    totalCost,
    users,
    scores,
    durationSeconds: Math.max(
      (maxTimestamp.getTime() - minTimestamp.getTime()) / 1000,
      0,
    ),
    usage: { input: tokensIn, output: tokensOut, total: totalTokens },
  });
  for (const path of metadataJsonPaths.paths) {
    const resolution = resolveAgainstSource(metadataJsonPaths.source, path);
    const text = (() => {
      if (resolution.state === "match") return resolution.displayValue;
      if (resolution.state === "loading" || resolution.state === "idle")
        return "…";
      if (
        resolution.state === "invalid" ||
        resolution.state === "error" ||
        resolution.state === "empty" ||
        resolution.state === "no-match"
      )
        return "—";
      return assertUnreachable(resolution);
    })();
    const label = getMetadataJsonPathLabel(path);
    metrics.push({
      id: `metadata-${path}`,
      type: "value",
      label,
      text,
      title: path,
      searchText: `metadata ${path} ${label} ${text}`,
      remove: {
        label: `Remove metadata JSONPath ${path}`,
        onClick: () => {
          metadataJsonPaths.onRemove(path);
          capture("session_detail:metadata_jsonpath_config_changed", {
            action: "remove",
            configuredPathCount: Math.max(
              metadataJsonPaths.paths.length - 1,
              0,
            ),
            isV4: true,
          });
        },
      },
    });
  }
  return (
    <FloatingController
      interaction="click"
      placement="bottom-end"
      open={isEditorOpen}
      onOpenChange={handleEditorOpenChange}
      returnFocus={editorTriggerRef}
      renderContent={(floatingProps) => (
        <div
          {...floatingProps}
          className="ph-no-capture bg-popover text-popover-foreground w-96 rounded-md border p-4 shadow-md outline-hidden"
          aria-label="Add metadata JSONPath"
        >
          <MetadataEditor
            metadataJsonPaths={metadataJsonPaths}
            onClose={() => handleEditorOpenChange(false)}
            onSave={handleSave}
          />
        </div>
      )}
    >
      {({ getTriggerProps }) =>
        children([
          ...metrics,
          {
            id: "edit-metadata",
            type: "action",
            label: "Edit Metadata",
            icon: Plus,
            onClick: () => handleEditorOpenChange(!isEditorOpen),
            // FloatingController supplies an HTMLElement ref; useInteractions types it as unknown.
            triggerRef: getTriggerProps().ref as React.Ref<HTMLElement>,
          },
        ])
      }
    </FloatingController>
  );
}
