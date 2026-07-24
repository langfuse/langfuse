import { useState } from "react";
import { MediaTag } from "./MediaTag";
import { useResolvedMedia } from "./useResolvedMedia";
import { type MediaDescriptor } from "./mediaUtils";
import { OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE } from "@langfuse/shared";

type LangfuseRefDescriptor = Extract<MediaDescriptor, { kind: "langfuseRef" }>;

/**
 * Container that connects a classified media value to the pure `MediaTag`: it
 * arms the lazy fetch the first time the peek opens (hover/focus) and keeps it
 * armed so re-hovers read from the query cache instead of re-fetching.
 */
export function JsonMediaTag({ descriptor }: { descriptor: MediaDescriptor }) {
  if (descriptor.kind !== "langfuseRef") {
    return (
      <MediaTag
        contentType={descriptor.contentType}
        status="ready"
        url={descriptor.src}
      />
    );
  }

  return <LangfuseRefMediaTag descriptor={descriptor} />;
}

function LangfuseRefMediaTag({
  descriptor,
}: {
  descriptor: LangfuseRefDescriptor;
}) {
  const [armed, setArmed] = useState(false);
  const { status, url } = useResolvedMedia(descriptor, { enabled: armed });
  const isOversizedField =
    descriptor.source === OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE;

  return (
    <MediaTag
      contentType={descriptor.contentType}
      status={status}
      url={url}
      label={isOversizedField ? "Field over size limit" : undefined}
      description={
        isOversizedField
          ? "This field exceeded the configured storage limit. Open the file to view the original content."
          : undefined
      }
      warning={isOversizedField}
      onOpenChange={(open) => {
        if (open) setArmed(true);
      }}
    />
  );
}
