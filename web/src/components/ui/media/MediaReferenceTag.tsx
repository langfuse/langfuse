/* eslint-disable @typescript-eslint/no-use-before-define */
import { MediaTag, type MediaTagProps } from "../../MediaTag/MediaTag";
import { useResolvedMedia } from "./useResolvedMedia";
import { useResolvedExternalMedia } from "./useResolvedExternalMedia";
import { type MediaDescriptor } from "./mediaUtils";
import { OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE } from "@langfuse/shared";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

type LangfuseRefDescriptor = Extract<MediaDescriptor, { kind: "langfuseRef" }>;
type S3Descriptor = Extract<MediaDescriptor, { kind: "s3" }>;

/**
 * Container that connects a classified media value to the pure `MediaTag`. The
 * resolver hooks own the peek: they arm the lazy fetch the first time it opens
 * (hover/focus) and serve re-hovers from the query cache until the URL nears
 * expiry.
 */
export function MediaReferenceTag({
  descriptor,
  label,
  size,
}: {
  descriptor: MediaDescriptor;
  label?: string;
  size?: MediaTagProps["size"];
}) {
  if (descriptor.kind === "s3") {
    return <S3MediaTag descriptor={descriptor} label={label} size={size} />;
  }

  if (descriptor.kind !== "langfuseRef") {
    return (
      <MediaTag
        contentType={descriptor.contentType}
        status="ready"
        url={descriptor.src}
        size={size}
      />
    );
  }

  return <LangfuseRefMediaTag descriptor={descriptor} size={size} />;
}

function S3MediaTag({
  descriptor,
  label,
  size,
}: {
  descriptor: S3Descriptor;
  label?: string;
  size?: MediaTagProps["size"];
}) {
  const projectId = useProjectIdFromURL();
  const isFeatureEnabled = useIsFeatureEnabled("externalMediaStorage", {
    enableForAdmins: false,
    projectId,
  });
  const { status, url, open, onOpenChange } = useResolvedExternalMedia(
    descriptor,
    { enabled: isFeatureEnabled },
  );

  if (!isFeatureEnabled) {
    return (
      <span
        className="inline-block max-w-full min-w-0 truncate align-middle"
        title={descriptor.uri}
      >
        {descriptor.uri}
      </span>
    );
  }

  return (
    <MediaTag
      contentType={descriptor.contentType}
      label={label}
      size={size}
      status={status}
      url={url}
      errorDetail={descriptor.uri}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

function LangfuseRefMediaTag({
  descriptor,
  size,
}: {
  descriptor: LangfuseRefDescriptor;
  size?: MediaTagProps["size"];
}) {
  const { status, url, contentLength, open, onOpenChange } =
    useResolvedMedia(descriptor);
  const isOversizedField =
    descriptor.source === OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE;

  return (
    <MediaTag
      contentType={descriptor.contentType}
      size={size}
      status={status}
      url={url}
      contentLength={contentLength}
      label={isOversizedField ? "Full value attached" : undefined}
      description={
        isOversizedField
          ? "This field was too large to process inline, so Langfuse saved the complete original value as an attachment at ingestion."
          : undefined
      }
      openActionLabel={isOversizedField ? "Open original" : undefined}
      intent={isOversizedField ? "attachment" : undefined}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
