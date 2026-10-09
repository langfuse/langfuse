import { Skeleton } from "@/src/components/ui/skeleton";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import { type MediaContentType } from "@/src/features/media";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { MediaFileView } from "./MediaFileView";
import { type MediaDescriptor } from "./mediaUtils";
import { useResolvedExternalMedia } from "./useResolvedExternalMedia";

export type ExternalMediaViewProps = {
  descriptor: S3MediaDescriptor;
};

export function ExternalMediaView({ descriptor }: ExternalMediaViewProps) {
  const projectId = useProjectIdFromURL();
  const isFeatureEnabled = useIsFeatureEnabled("externalMediaStorage", {
    enableForAdmins: false,
    projectId,
  });
  if (!isFeatureEnabled) return <ExternalMediaFallback uri={descriptor.uri} />;

  return <EnabledExternalMediaView descriptor={descriptor} />;
}

function EnabledExternalMediaView({ descriptor }: ExternalMediaViewProps) {
  const { status, url } = useResolvedExternalMedia(descriptor, {
    enabled: true,
  });

  if (status === "idle" || status === "error") {
    return <ExternalMediaFallback uri={descriptor.uri} />;
  }

  if (status === "loading" || !url) {
    return <Skeleton className="h-24 w-24 max-w-full" />;
  }

  return (
    <MediaFileView
      src={url}
      contentType={descriptor.contentType as MediaContentType}
      defaultExpanded
    />
  );
}

function ExternalMediaFallback({ uri }: ExternalMediaFallbackProps) {
  return (
    <span
      className="text-muted-foreground block max-w-full min-w-0 truncate text-xs"
      title={uri}
    >
      {uri}
    </span>
  );
}

type S3MediaDescriptor = Extract<MediaDescriptor, { kind: "s3" }>;

type ExternalMediaFallbackProps = {
  uri: string;
};
