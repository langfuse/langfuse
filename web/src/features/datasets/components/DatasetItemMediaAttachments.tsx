import { memo, type RefObject, useMemo, useRef, useState } from "react";
import type { EditorView, ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { type Extension } from "@codemirror/state";
import { Check, Copy, Loader2, Paperclip } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { createFileDropPasteExtension } from "@/src/components/editor";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { type PendingMediaUpload } from "../hooks/useDatasetItemMediaUpload";
import {
  MediaEnabledFields,
  type MediaContentType,
  type MediaReturnType,
} from "@/src/features/media/validation";
import { api } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  findMediaReferences,
  MEDIA_REFERENCE_PATTERN,
  MediaReferenceStringSchema,
} from "@langfuse/shared";

/**
 * Extracts media references from live dataset item fields, deduped by media id.
 * Valid JSON uses the backend-style collector; invalid mid-edit JSON falls back
 * to regex so previews do not disappear while typing.
 */
export function collectMediaReferenceStrings(
  jsonStrings: (string | undefined)[],
): string[] {
  const byMediaId = new Map<string, string>();
  const addReferenceString = (referenceString: string) => {
    const parsed = MediaReferenceStringSchema.safeParse(referenceString);
    if (parsed.success && !byMediaId.has(parsed.data.id)) {
      byMediaId.set(parsed.data.id, parsed.data.referenceString);
    }
  };

  for (const jsonString of jsonStrings) {
    if (!jsonString) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      for (const match of jsonString.matchAll(MEDIA_REFERENCE_PATTERN)) {
        addReferenceString(match[0]);
      }
      continue;
    }
    for (const reference of findMediaReferences(parsed)) {
      if (!byMediaId.has(reference.id)) {
        byMediaId.set(reference.id, reference.referenceString);
      }
    }
  }
  return [...byMediaId.values()];
}

/**
 * Inserts a media reference as a JSON string literal at the editor's current
 * selection. Wrapping in quotes makes it a valid value when the cursor sits in
 * a value slot; the form's JSON validation surfaces misplacement otherwise.
 */
function insertMediaReferenceIntoView(
  view: EditorView,
  referenceString: string,
): void {
  const insert = JSON.stringify(referenceString);
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  });
  view.focus();
}

/**
 * Inserts a media reference at the editor's cursor (see
 * `insertMediaReferenceIntoView`). No-op when the editor is not yet mounted.
 */
export function insertMediaReferenceAtCursor(
  editorRef: RefObject<ReactCodeMirrorRef | null>,
  referenceString: string,
): void {
  const view = editorRef.current?.view;
  if (!view) return;
  insertMediaReferenceIntoView(view, referenceString);
}

/**
 * CodeMirror extension that uploads files dropped onto or pasted into the
 * editor and inserts their media reference strings at the cursor, mirroring
 * the attach button. Built on the generic file drop/paste handler; only the
 * upload-and-insert action is media-specific. `onUploadMedia` returns the
 * reference string (or null on failure, which the upload hook surfaces via
 * toast).
 */
export function createMediaDropPasteExtension({
  onUploadMedia,
}: {
  onUploadMedia: (file: File) => Promise<string | null>;
}): Extension {
  // Failures are surfaced via toast inside `onUploadMedia` (which resolves to
  // null rather than rejecting), so this never throws; the trailing `.catch`
  // just keeps the fire-and-forget promise from floating.
  const uploadAndInsert = async (view: EditorView, files: File[]) => {
    for (const file of files) {
      const referenceString = await onUploadMedia(file);
      if (referenceString) insertMediaReferenceIntoView(view, referenceString);
    }
  };

  return createFileDropPasteExtension({
    onFiles: (files, view) => {
      uploadAndInsert(view, files).catch(() => {});
    },
  });
}

/**
 * Attach button for a dataset item field. Shows a spinner while its upload is
 * in flight; failures surface via toast from the upload hook.
 */
export function DatasetItemMediaUploadButton({
  onSelectFile,
  disabled,
}: {
  onSelectFile: (file: File) => void | Promise<void>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setIsUploading(true);
          try {
            await onSelectFile(file);
          } finally {
            setIsUploading(false);
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        disabled={disabled || isUploading}
        title="Attach media"
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Paperclip className="h-3 w-3" />
        )}
      </Button>
    </>
  );
}

/**
 * Copy-to-clipboard button for a dataset item field's raw value. Mirrors the
 * copy control in `MarkdownJsonViewHeader`: briefly swaps to a check icon as
 * confirmation.
 */
function CopyFieldValueButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground"
      title="Copy to clipboard"
      onClick={async () => {
        await copyTextToClipboard(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

/**
 * Persistent action toolbar for a dataset item field header, styled after
 * `MarkdownJsonViewHeader`. Always offers Copy; shows the media attach button
 * when `onSelectFile` is provided (form, editable).
 */
export function DatasetItemFieldToolbar({
  copyValue,
  onSelectFile,
}: {
  copyValue: string;
  onSelectFile?: (file: File) => void | Promise<void>;
}) {
  return (
    <div className="ml-auto flex items-center gap-0.5">
      <CopyFieldValueButton value={copyValue} />
      {onSelectFile && (
        <DatasetItemMediaUploadButton onSelectFile={onSelectFile} />
      )}
    </div>
  );
}

/**
 * Spinner placeholder shown in the attachment grid while an upload is in
 * flight. Covers all entry points (attach button, drop, paste) since they all
 * route through the upload hook's pending state. Sized like a media file tile.
 */
function PendingMediaTile({ fileName }: { fileName: string }) {
  return (
    <div className="flex h-24 w-24 flex-col items-center justify-center gap-2 rounded-md border px-2 text-center">
      <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      <span
        className="text-muted-foreground w-full truncate text-xs"
        title={fileName}
      >
        {fileName}
      </span>
    </div>
  );
}

/**
 * Attachment section below the dataset item fields: a heading matching the
 * field labels, a grid of media previews, and a placeholder per in-flight
 * upload. Renders nothing when there is neither media nor a pending upload.
 */
function DatasetItemAttachments({
  media,
  pendingUploads = [],
}: {
  media: MediaReturnType[];
  pendingUploads?: PendingMediaUpload[];
}) {
  if (media.length === 0 && pendingUploads.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Attachments</span>
      <div className="flex flex-wrap gap-2">
        {media.map((m) => (
          <LangfuseMediaView
            key={m.mediaId}
            mediaAPIReturnValue={m}
            asFileIcon={!m.contentType.startsWith("image")}
          />
        ))}
        {pendingUploads.map((u) => (
          <PendingMediaTile key={u.id} fileName={u.fileName} />
        ))}
      </div>
    </div>
  );
}

/**
 * Read-only attachment section for a saved dataset item, resolved from the
 * dataset_item_media table (not the item JSON) so it reflects the persisted
 * associations of the displayed version.
 */
export function DatasetItemSavedMediaAttachments({
  projectId,
  datasetItemId,
  datasetItemValidFrom,
}: {
  projectId: string;
  datasetItemId: string;
  // The viewed version; omitted for the latest item (resolves the current
  // version), passed for a historical version to show that version's media.
  datasetItemValidFrom?: Date;
}) {
  const { data } = api.datasets.itemMediaByItemId.useQuery(
    { projectId, datasetItemId, datasetItemValidFrom },
    { refetchOnWindowFocus: false, refetchOnMount: false },
  );

  const mediaById = new Map<string, MediaReturnType>();
  for (const reference of data ?? []) {
    if (reference.media && !mediaById.has(reference.media.mediaId)) {
      mediaById.set(reference.media.mediaId, {
        ...reference.media,
        contentType: reference.media.contentType as MediaContentType,
        // field is required on MediaReturnType but unused by the grid
        field: MediaEnabledFields.Input,
      });
    }
  }

  return <DatasetItemAttachments media={[...mediaById.values()]} />;
}

/**
 * Attachment section for the create/edit forms. Collects the media references
 * from the live field JSON (which may include just-uploaded media not yet
 * persisted), resolves them to signed URLs for preview, and shows placeholders
 * for in-flight uploads. `jsonStrings` are the raw input/expectedOutput/metadata
 * values; collection lives here so callers don't need to know about it.
 */
export function DatasetItemFormMediaAttachments({
  projectId,
  jsonStrings,
  pendingUploads,
}: {
  projectId: string;
  jsonStrings: (string | undefined)[];
  pendingUploads?: PendingMediaUpload[];
}) {
  // Recomputed each render (cheap relative to the keystroke that triggers it),
  // but its identity is stabilized by content so the memoized resolver below
  // only re-renders when the set of media references actually changes — typing
  // plain text into the fields no longer churns the media previews.
  const referenceStrings = collectMediaReferenceStrings(jsonStrings);
  const referenceKey = referenceStrings.join("\n");
  const stableReferenceStrings = useMemo(
    () => referenceStrings,
    // Keyed on the joined content, not the (always-new) array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [referenceKey],
  );

  return (
    <ResolvedMediaAttachments
      projectId={projectId}
      referenceStrings={stableReferenceStrings}
      pendingUploads={pendingUploads}
    />
  );
}

/**
 * Resolves media reference strings to signed URLs and renders the preview grid.
 * Memoized so it re-renders only when the reference set or pending uploads
 * change, not on every keystroke in the dataset item fields.
 */
const ResolvedMediaAttachments = memo(function ResolvedMediaAttachments({
  projectId,
  referenceStrings,
  pendingUploads,
}: {
  projectId: string;
  referenceStrings: string[];
  pendingUploads?: PendingMediaUpload[];
}) {
  const { data } = api.datasets.resolveItemMediaReferences.useQuery(
    { projectId, referenceStrings },
    { refetchOnWindowFocus: false, enabled: referenceStrings.length > 0 },
  );

  return (
    <DatasetItemAttachments
      media={data ?? []}
      pendingUploads={pendingUploads}
    />
  );
});
