import { useCallback, useMemo, useRef } from "react";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { type Extension } from "@codemirror/state";

import {
  CodeMirrorEditor,
  createJsonMagicPasteExtension,
} from "@/src/components/editor";
import { DatasetSchemaHoverCard } from "./DatasetSchemaHoverCard";
import { DatasetItemFieldSchemaErrors } from "./DatasetItemFieldSchemaErrors";
import {
  createMediaDropPasteExtension,
  DatasetItemFieldToolbar,
  insertMediaReferenceAtCursor,
} from "./DatasetItemMediaAttachments";
import type { Prisma } from "@langfuse/shared";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";

type DatasetError = {
  datasetId: string;
  datasetName: string;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
  }>;
};

type DatasetItemFieldProps = {
  label: string;
  value: string;
  schema?: Prisma.JsonValue | null;
  schemaType?: "input" | "expectedOutput";
  editable: boolean;
  onChange?: (value: string) => void;
  errors?: DatasetError[];
  hasSchemas?: boolean;
  showErrors?: boolean;
  // For form integration
  isFormField?: boolean;
  // When provided (form mode), shows a media attach button that uploads the
  // file and inserts its reference string at the editor cursor.
  onUploadMedia?: (file: File) => Promise<string | null>;
};

/**
 * Reusable field component for dataset item input/output/metadata.
 * Handles display, editing, schema validation, and error messages.
 */
export const DatasetItemField = ({
  label,
  value,
  schema,
  schemaType,
  editable,
  onChange,
  errors = [],
  hasSchemas = false,
  showErrors = true,
  isFormField = false,
  onUploadMedia,
}: DatasetItemFieldProps) => {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const showMediaUpload = isFormField && editable && !!onUploadMedia;

  const handleSelectFile = async (file: File) => {
    const referenceString = await onUploadMedia?.(file);
    if (referenceString)
      insertMediaReferenceAtCursor(editorRef, referenceString);
  };

  // `onUploadMedia` (tRPC-backed) is a fresh reference each render; route the
  // extension through a ref so it is built once and never churns the editor's
  // CodeMirror config on re-render (e.g. on every keystroke).
  const onUploadMediaRef = useRef(onUploadMedia);
  onUploadMediaRef.current = onUploadMedia;

  // `onChange` from the react-hook-form render prop is a fresh reference each
  // render; route it through a ref so the editor gets a stable handler and
  // doesn't reconfigure CodeMirror on every keystroke.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const handleChange = useCallback((v: string) => onChangeRef.current?.(v), []);

  // Editable form editors get magic paste (auto-escape/wrap pasted text to keep
  // the JSON valid) and, when media upload is wired, the file drop/paste handler
  // (upload then insert the reference). Read-only/view editors keep native
  // drop/paste behavior.
  const editorExtensions = useMemo(() => {
    if (!(isFormField && editable)) return undefined;
    const extensions: Extension[] = [createJsonMagicPasteExtension()];
    if (showMediaUpload) {
      extensions.push(
        createMediaDropPasteExtension({
          onUploadMedia: (file) =>
            onUploadMediaRef.current?.(file) ?? Promise.resolve(null),
        }),
      );
    }
    return extensions;
  }, [isFormField, editable, showMediaUpload]);

  const content = (
    <>
      <div className="flex items-center gap-2">
        {isFormField ? (
          <FormLabel>{label}</FormLabel>
        ) : (
          <label className="text-sm font-medium">{label}</label>
        )}
        {schema && schemaType && (
          <DatasetSchemaHoverCard
            schema={schema}
            schemaType={schemaType}
            showLabel
          />
        )}
        <DatasetItemFieldToolbar
          copyValue={value}
          onSelectFile={showMediaUpload ? handleSelectFile : undefined}
        />
      </div>
      {isFormField ? (
        <FormControl>
          <CodeMirrorEditor
            mode="json"
            value={value}
            onChange={handleChange}
            editable={editable}
            editorRef={editorRef}
            minHeight={200}
            extensions={editorExtensions}
          />
        </FormControl>
      ) : (
        <CodeMirrorEditor
          mode="json"
          value={value}
          editable={editable}
          minHeight={200}
        />
      )}
      {isFormField && <FormMessage />}
      {showErrors && hasSchemas && errors.length > 0 && (
        <DatasetItemFieldSchemaErrors errors={errors} showDatasetName={false} />
      )}
    </>
  );

  return isFormField ? (
    <FormItem>{content}</FormItem>
  ) : (
    <div className="space-y-2">{content}</div>
  );
};
