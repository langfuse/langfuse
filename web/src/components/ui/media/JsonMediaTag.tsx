import { useState } from "react";
import { MediaTag } from "./MediaTag";
import { useResolvedMedia } from "./useResolvedMedia";
import { type MediaLeafDescriptor } from "./classifyMediaLeaf";

type LangfuseRefDescriptor = Extract<
  MediaLeafDescriptor,
  { kind: "langfuseRef" }
>;

/**
 * Container that connects a classified media leaf to the pure `MediaTag`: it
 * arms the lazy fetch the first time the peek opens (hover/focus) and keeps it
 * armed so re-hovers read from the query cache instead of re-fetching.
 */
export function JsonMediaTag({
  descriptor,
}: {
  descriptor: MediaLeafDescriptor;
}) {
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

  return (
    <MediaTag
      contentType={descriptor.contentType}
      status={status}
      url={url}
      onOpenChange={(open) => {
        if (open) setArmed(true);
      }}
    />
  );
}
