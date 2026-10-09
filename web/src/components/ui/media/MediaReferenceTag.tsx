import { useState } from "react";
import {
  MediaTag,
  type MediaTagProps,
  type MediaTagStatus,
} from "../../MediaTag/MediaTag";
import { useResolvedMedia } from "./useResolvedMedia";
import { type MediaDescriptor } from "./mediaUtils";
import { OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";

type LangfuseRefDescriptor = Extract<MediaDescriptor, { kind: "langfuseRef" }>;
type S3Descriptor = Extract<MediaDescriptor, { kind: "s3" }>;

function getS3MediaStatus({
  armed,
  isError,
  hasData,
}: {
  armed: boolean;
  isError: boolean;
  hasData: boolean;
}): MediaTagStatus {
  if (!armed) return "idle";
  if (isError) return "error";
  if (hasData) return "ready";
  return "loading";
}

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
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string"
      ? router.query.projectId
      : undefined;
  const isFeatureEnabled = useIsFeatureEnabled("externalMediaStorage", {
    enableForAdmins: false,
    projectId,
  });

  if (!isFeatureEnabled) return descriptor.uri;

  return (
    <EnabledS3MediaTag
      descriptor={descriptor}
      label={label}
      size={size}
      projectId={projectId}
    />
  );
}

function EnabledS3MediaTag({
  descriptor,
  label,
  size,
  projectId,
}: {
  descriptor: S3Descriptor;
  label?: string;
  size?: MediaTagProps["size"];
  projectId?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const resolved = api.media.resolveExternalMedia.useQuery(
    { projectId: projectId ?? "", uri: descriptor.uri },
    {
      enabled: armed && Boolean(projectId),
      staleTime: 4 * 60 * 1000,
      refetchInterval: open ? 4 * 60 * 1000 : false,
      retry: false,
      meta: { silentHttpCodes: [404] },
    },
  );

  const isSignedUrlExpired =
    resolved.data?.expiresAt !== undefined &&
    resolved.data.expiresAt.getTime() <= Date.now();
  const status = getS3MediaStatus({
    armed,
    isError: resolved.isError,
    hasData: Boolean(resolved.data) && !isSignedUrlExpired,
  });

  return (
    <MediaTag
      contentType={descriptor.contentType}
      label={label}
      size={size}
      status={status}
      url={isSignedUrlExpired ? undefined : resolved.data?.url}
      errorDetail={descriptor.uri}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          if (armed && isSignedUrlExpired) resolved.refetch();
          setArmed(true);
        }
      }}
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
