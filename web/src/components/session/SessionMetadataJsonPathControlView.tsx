import { Plus, X } from "lucide-react";
import { type SyntheticEvent, useState } from "react";

import { ModernSessionHeaderPill } from "@/src/components/session/ModernSessionHeaderPill";
import {
  getMetadataJsonPathLabel,
  resolveMetadataJsonPath,
} from "@/src/components/session/sessionMetadataJsonPath";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

type FirstVisibleObservationMetadataState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error" }
  | { state: "empty" }
  | { state: "ready"; metadata: unknown; metadataTruncated: boolean };

type SessionMetadataJsonPathControlViewProps = {
  paths: readonly string[];
  source: FirstVisibleObservationMetadataState;
  isEditorOpen: boolean;
  onEditorOpenChange: (open: boolean) => void;
  onSave: (path: string) => void;
  onRemove: (path: string) => void;
};

const resolveAgainstSource = ({
  source,
  path,
}: {
  source: FirstVisibleObservationMetadataState;
  path: string;
}) => {
  const syntax = resolveMetadataJsonPath({}, path);
  if (syntax.state === "invalid") return syntax;
  if (source.state !== "ready") return source;
  return resolveMetadataJsonPath(source.metadata, path);
};

const getConfiguredDisplay = ({
  path,
  source,
}: {
  path: string;
  source: FirstVisibleObservationMetadataState;
}) => {
  const resolution = resolveAgainstSource({
    source,
    path,
  });
  const displayValue =
    resolution.state === "match"
      ? resolution.displayValue
      : resolution.state === "loading" || resolution.state === "idle"
        ? "…"
        : "—";

  return {
    path,
    label: getMetadataJsonPathLabel(path),
    displayValue,
    title: `${path}: ${displayValue}`,
  };
};

export function SessionMetadataJsonPathControlView({
  paths,
  source,
  isEditorOpen,
  onEditorOpenChange,
  onSave,
  onRemove,
}: SessionMetadataJsonPathControlViewProps) {
  const [draftPath, setDraftPath] = useState("");
  const normalizedDraftPath = draftPath.trim();
  const draftResolution = resolveAgainstSource({ source, path: draftPath });
  const configuredDisplays = paths.map((path) =>
    getConfiguredDisplay({ path, source }),
  );
  const draftIsDuplicate = paths.includes(normalizedDraftPath);
  const draftIsValid =
    normalizedDraftPath.length > 0 &&
    draftResolution.state !== "invalid" &&
    !draftIsDuplicate;

  const handleOpenChange = (open: boolean) => {
    if (open) setDraftPath("");
    onEditorOpenChange(open);
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftIsValid) return;
    onSave(normalizedDraftPath);
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      {configuredDisplays.map((configuredDisplay) => (
        <span key={configuredDisplay.path} className="group flex items-center">
          <ModernSessionHeaderPill
            variant="display"
            title={configuredDisplay.title}
          >
            <span className="max-w-40 truncate" title={configuredDisplay.path}>
              {configuredDisplay.label}
            </span>
            <span
              className="text-foreground max-w-56 truncate"
              title={configuredDisplay.displayValue}
            >
              {configuredDisplay.displayValue}
            </span>
            <span className="-ml-1.5 inline-flex w-0 overflow-hidden transition-[width,margin] group-focus-within:ml-0 group-focus-within:w-4 group-hover:ml-0 group-hover:w-4">
              <button
                type="button"
                aria-label={`Remove metadata JSONPath ${configuredDisplay.path}`}
                title="Remove metadata JSONPath"
                className="hover:bg-muted focus-visible:ring-ring inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
                onClick={() => onRemove(configuredDisplay.path)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </ModernSessionHeaderPill>
        </span>
      ))}
      <Popover open={isEditorOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <ModernSessionHeaderPill
            variant="button"
            ariaLabel="Add metadata JSONPath"
          >
            <Plus className="h-3 w-3" />
          </ModernSessionHeaderPill>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-96"
          aria-label="Add metadata JSONPath"
        >
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-metadata-jsonpath">
                Metadata JSONPath
              </Label>
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
              {draftIsDuplicate ? (
                <span className="text-muted-foreground">
                  This JSONPath is already shown.
                </span>
              ) : draftResolution.state === "match" ? (
                <span className="font-mono break-all">
                  {draftResolution.displayValue}
                </span>
              ) : draftResolution.state === "invalid" ? (
                <span className="text-destructive">
                  {draftResolution.message}
                </span>
              ) : draftResolution.state === "loading" ||
                draftResolution.state === "idle" ? (
                <span className="text-muted-foreground">
                  Loading first visible observation…
                </span>
              ) : draftResolution.state === "error" ? (
                <span className="text-destructive">
                  Could not load the first visible observation.
                </span>
              ) : draftResolution.state === "empty" ? (
                <span className="text-muted-foreground">
                  No observation matches the current view.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  No match on the first visible observation.
                </span>
              )}
              {source.state === "ready" && source.metadataTruncated ? (
                <span className="text-amber-600 dark:text-amber-500">
                  Metadata is truncated in this session preview.
                </span>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!draftIsValid}>
                Save
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
