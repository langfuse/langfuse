import { type RefObject, useRef, useState } from "react";
import type { EditorView, ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { type Extension } from "@codemirror/state";
import { Check, Copy, Loader2, Paperclip } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { createFileDropPasteExtension } from "@/src/components/editor";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { type PendingMediaUpload } from "../hooks/useDatasetItemMediaUpload";
import {
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

type SliceableDoc = {
  readonly length: number;
  sliceString(from: number, to?: number): string;
};

export function getMediaReferenceInsertRange(
  doc: SliceableDoc,
  from: number,
  to: number,
) {
  if (doc.sliceString(from, to) === '""') {
    return { from, to };
  }

  if (
    from === to &&
    from > 0 &&
    from < doc.length &&
    doc.sliceString(from - 1, from) === '"' &&
    doc.sliceString(from, from + 1) === '"'
  ) {
    return { from: from - 1, to: from + 1 };
  }

  return { from, to };
}

/**
 * Inserts a media reference as a JSON string literal. Wrapping in quotes makes
 * it a valid value when inserted in a value slot; the form's JSON validation
 * surfaces misplacement otherwise. Inserts at `anchor` (the drop position) when
 * given, else at the current selection.
 */
function insertMediaReferenceIntoView(
  view: EditorView,
  referenceString: string,
  anchor?: number,
): void {
  const insert = JSON.stringify(referenceString);
  // Clamp the drop anchor: the document may have shrunk during an async upload.
  const pos =
    anchor != null ? Math.min(anchor, view.state.doc.length) : undefined;
  const { from, to } =
    pos != null ? { from: pos, to: pos } : view.state.selection.main;
  const range = getMediaReferenceInsertRange(view.state.doc, from, to);
  view.dispatch({
    changes: { ...range, insert },
    selection: { anchor: range.from + insert.length },
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
  const uploadAndInsert = async (
    view: EditorView,
    files: File[],
    anchor?: number,
  ) => {
    // Anchor the first insert to the drop position; later files follow the
    // cursor moved by the previous insert, preserving drop order.
    let nextAnchor = anchor;
    for (const file of files) {
      const referenceString = await onUploadMedia(file);
      if (referenceString) {
        insertMediaReferenceIntoView(view, referenceString, nextAnchor);
        nextAnchor = undefined;
      }
    }
  };

  return createFileDropPasteExtension({
    onFiles: (files, view, anchor) => {
      uploadAndInsert(view, files, anchor).catch(() => {});
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
  referenceStrings = [],
  pendingUploads = [],
}: {
  media: Omit<MediaReturnType, "field">[];
  referenceStrings?: string[];
  pendingUploads?: PendingMediaUpload[];
}) {
  if (
    media.length === 0 &&
    referenceStrings.length === 0 &&
    pendingUploads.length === 0
  )
    return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Attachments</span>
      <div className="flex flex-wrap gap-2">
        {referenceStrings.map((referenceString) => (
          <LangfuseMediaView
            key={referenceString}
            mediaReferenceString={referenceString}
            variant="preview"
          />
        ))}
        {media.map((m) => (
          <LangfuseMediaView
            key={m.mediaId}
            mediaAPIReturnValue={m}
            variant="preview"
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

  const mediaById = new Map<string, Omit<MediaReturnType, "field">>();
  for (const reference of data ?? []) {
    if (!mediaById.has(reference.media.mediaId)) {
      mediaById.set(reference.media.mediaId, {
        ...reference.media,
        contentType: reference.media.contentType as MediaContentType,
      });
    }
  }

  return <DatasetItemAttachments media={[...mediaById.values()]} />;
}

/**
 * Attachment section for the create/edit forms. Collects the media references
 * from the live field JSON (which may include just-uploaded media not yet
 * persisted), and shows placeholders for in-flight uploads. `jsonStrings` are
 * the raw input/expectedOutput/metadata values; collection lives here so callers
 * don't need to know about it.
 */
export function DatasetItemFormMediaAttachments({
  jsonStrings,
  pendingUploads,
}: {
  jsonStrings: (string | undefined)[];
  pendingUploads?: PendingMediaUpload[];
}) {
  const referenceStrings = collectMediaReferenceStrings(jsonStrings);

  return (
    <DatasetItemAttachments
      media={[]}
      referenceStrings={referenceStrings}
      pendingUploads={pendingUploads}
    />
  );
}
