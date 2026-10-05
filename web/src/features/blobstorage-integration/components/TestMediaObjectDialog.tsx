import { parseS3Uri } from "@langfuse/shared";
import { useId, useState, type SyntheticEvent } from "react";

import { MediaFileCard } from "@/src/components/MediaFileCard/MediaFileCard";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { classifyMediaValue } from "@/src/components/ui/media/mediaUtils";
import { ResizableImage } from "@/src/components/ui/resizable-image";

export function TestMediaObjectDialog({
  isPending,
  onTest,
}: {
  isPending: boolean;
  onTest: (uri: string) => Promise<string | null>;
}) {
  const [uri, setUri] = useState("");
  const [preview, setPreview] = useState<{
    signedUrl: string;
    uri: string;
  } | null>(null);
  const formId = useId();
  const inputId = useId();

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedUri = uri.trim();
    setPreview(null);
    const signedUrl = await onTest(submittedUri);
    setPreview(signedUrl ? { signedUrl, uri: submittedUri } : null);
  };

  return (
    <Dialog
      closeOnInteractionOutside
      title="Test external media object"
      actions={[
        {
          disabled: !uri.trim(),
          form: formId,
          label: "Test",
          loading: isPending,
          type: "submit",
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground text-sm">
          Enter an s3:// URI to check server access and browser CORS, then
          preview the media.
        </p>
        <form id={formId} className="grid gap-2" onSubmit={handleSubmit}>
          <Label htmlFor={inputId}>S3 URI</Label>
          <Input
            id={inputId}
            value={uri}
            placeholder="s3://bucket/media/image.png"
            disabled={isPending}
            onChange={(event) => {
              setUri(event.target.value);
              setPreview(null);
            }}
          />
        </form>
        {preview ? (
          <MediaObjectPreview
            key={preview.signedUrl}
            signedUrl={preview.signedUrl}
            uri={preview.uri}
          />
        ) : null}
      </Dialog.Body>
    </Dialog>
  );
}

function MediaObjectPreview({
  signedUrl,
  uri,
}: {
  signedUrl: string;
  uri: string;
}) {
  const [hasLoadError, setHasLoadError] = useState(false);
  const descriptor = classifyMediaValue(uri);
  const contentType = descriptor?.contentType ?? "application/octet-stream";
  const fileName =
    parseS3Uri(uri)?.key.split("/").pop() || "external media object";
  const mediaType = contentType.split("/")[0];
  const previewContent =
    mediaType === "image" ? (
      <ResizableImage
        src={signedUrl}
        alt={`Preview ${fileName}`}
        isDefaultVisible
        shouldValidateImageSource={false}
        fitContent
      />
    ) : mediaType === "audio" ? (
      <audio
        aria-label={`Preview ${fileName}`}
        controls
        className="w-full"
        preload="metadata"
        onError={() => setHasLoadError(true)}
        src={signedUrl}
      />
    ) : mediaType === "video" ? (
      <video
        aria-label={`Preview ${fileName}`}
        controls
        className="w-full"
        preload="metadata"
        playsInline
        onError={() => setHasLoadError(true)}
        src={signedUrl}
      />
    ) : (
      <MediaFileCard
        contentType={contentType}
        fileName={fileName}
        onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}
      />
    );

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p className="text-sm font-bold">Preview</p>
      {previewContent}
      {hasLoadError ? (
        <p className="text-destructive text-sm">
          The media preview could not be loaded.
        </p>
      ) : null}
    </div>
  );
}
