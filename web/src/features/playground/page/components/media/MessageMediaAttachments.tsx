import { Loader2, Paperclip, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/src/components/ui/button";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { useMediaUpload } from "./useMediaUpload";
import {
  addMediaPart,
  type ChatMessageContent,
  getMediaParts,
  removeMediaPart,
} from "@langfuse/shared";

/**
 * Attach images to a (user) chat message and show what's attached. The text of
 * the message keeps being edited in the CodeMirror editor; media lives here as
 * structured content parts that are uploaded to Langfuse media storage and
 * referenced by token.
 */
export const MessageMediaAttachments = ({
  projectId,
  content,
  onChange,
}: {
  projectId: string;
  content: ChatMessageContent;
  onChange: (content: ChatMessageContent) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFiles, isUploading } = useMediaUpload(projectId);

  const mediaParts = getMediaParts(content);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const parts = await uploadFiles(Array.from(files));
    if (parts.length > 0) {
      let next: ChatMessageContent = content;
      for (const part of parts) next = addMediaPart(next, part);
      onChange(next);
    }

    // Reset so selecting the same file again re-triggers onChange.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          className="text-muted-foreground h-6 gap-1 px-2 text-[10px]"
        >
          {isUploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Paperclip className="h-3 w-3" />
          )}
          Attach image
        </Button>
      </div>

      {mediaParts.length > 0 && (
        <div className="flex flex-row flex-wrap gap-2">
          {mediaParts.map((part) => (
            <div key={part.mediaId} className="group relative">
              <LangfuseMediaView
                mediaReferenceString={part.reference}
                asFileIcon
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Remove attachment"
                onClick={() => onChange(removeMediaPart(content, part.mediaId))}
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 opacity-80 shadow-xs transition-opacity hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
