import { useState } from "react";
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
 * Container that connects a classified media value to the pure `MediaTag`: it
 * arms the lazy fetch the first time the peek opens (hover/focus) and keeps it
 * armed so re-hovers read from the query cache instead of re-fetching.
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
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const { status, url, refresh } = useResolvedExternalMedia(descriptor, {
    enabled: isFeatureEnabled && armed,
  });
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;

    if (armed && status === "error") {
      refresh().catch(() => undefined);
    }
    setArmed(true);
  };

  if (!isFeatureEnabled) {
    return (
      <span
        className="block max-w-full min-w-0 truncate"
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
      onOpenChange={handleOpenChange}
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
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const { status, url, contentLength } = useResolvedMedia(descriptor, {
    enabled: armed,
  });
  const isOversizedField =
    descriptor.source === OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE;
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setArmed(true);
  };

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
      onOpenChange={handleOpenChange}
    />
  );
}
