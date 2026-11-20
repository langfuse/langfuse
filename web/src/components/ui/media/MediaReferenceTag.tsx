import { MediaTag, type MediaTagProps } from "../../MediaTag/MediaTag";
import { useResolvedMedia } from "./useResolvedMedia";
import { useResolvedExternalMedia } from "./useResolvedExternalMedia";
import { type MediaDescriptor } from "./mediaUtils";
import { OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE } from "@langfuse/shared";
import { useHasExternalMediaStorageAccess } from "@/src/ee/features/external-media-storage/hooks/useHasExternalMediaStorageAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useMediaPeek } from "@/src/features/media/hooks/useMediaPeek";
import { ConnectedSafeImageController } from "@/src/components/design-system/ConnectedSafeImageController/ConnectedSafeImageController";
import { SafeImageController } from "@/src/components/design-system/SafeImageController/SafeImageController";

type LangfuseRefDescriptor = Extract<MediaDescriptor, { kind: "langfuseRef" }>;
type S3Descriptor = Extract<MediaDescriptor, { kind: "s3" }>;

/**
 * Container that connects a classified media value to the pure `MediaTag`: it
 * arms the lazy fetch the first time the peek opens (hover/focus), serves
 * re-hovers from the query cache, and renews the URL on an open once it nears
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
    const props: MediaTagProps = {
      contentType: descriptor.contentType,
      status: "ready",
      url: descriptor.src,
      size,
    };
    if (!descriptor.contentType.startsWith("image/")) {
      return <MediaTag {...props} />;
    }
    const ImageController =
      descriptor.kind === "url"
        ? ConnectedSafeImageController
        : SafeImageController;
    return (
      <ImageController src={descriptor.src}>
        {(imageState) => <MediaTag {...props} imageState={imageState} />}
      </ImageController>
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
  const isFeatureEnabled = useHasExternalMediaStorageAccess(projectId);
  const peek = useMediaPeek();
  const { status, url, refreshIfNeeded } = useResolvedExternalMedia(
    descriptor,
    { enabled: isFeatureEnabled && peek.armed },
  );
  const handleOpenChange = (open: boolean) =>
    peek.onOpenChange(open, refreshIfNeeded);

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

  const props: MediaTagProps = {
    contentType: descriptor.contentType,
    label,
    size,
    status,
    url,
    errorDetail: descriptor.uri,
    open: peek.open,
    onOpenChange: handleOpenChange,
  };
  if (
    !descriptor.contentType.startsWith("image/") ||
    status !== "ready" ||
    !url
  ) {
    return <MediaTag {...props} />;
  }
  return (
    <SafeImageController src={url}>
      {(imageState) => <MediaTag {...props} imageState={imageState} />}
    </SafeImageController>
  );
}

function LangfuseRefMediaTag({
  descriptor,
  size,
}: {
  descriptor: LangfuseRefDescriptor;
  size?: MediaTagProps["size"];
}) {
  const peek = useMediaPeek();
  const { status, url, contentLength, refreshIfNeeded } = useResolvedMedia(
    descriptor,
    { enabled: peek.armed },
  );
  const handleOpenChange = (open: boolean) =>
    peek.onOpenChange(open, refreshIfNeeded);
  const isOversizedField =
    descriptor.source === OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE;

  const props: MediaTagProps = {
    contentType: descriptor.contentType,
    size,
    status,
    url,
    contentLength,
    label: isOversizedField ? "Full value attached" : undefined,
    description: isOversizedField
      ? "This field was too large to process inline, so Langfuse saved the complete original value as an attachment at ingestion."
      : undefined,
    openActionLabel: isOversizedField ? "Open original" : undefined,
    intent: isOversizedField ? "attachment" : undefined,
    open: peek.open,
    onOpenChange: handleOpenChange,
  };
  if (
    !descriptor.contentType.startsWith("image/") ||
    status !== "ready" ||
    !url
  ) {
    return <MediaTag {...props} />;
  }

  return (
    <SafeImageController src={url}>
      {(imageState) => <MediaTag {...props} imageState={imageState} />}
    </SafeImageController>
  );
}
