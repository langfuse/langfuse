import { Skeleton } from "@/src/components/ui/skeleton";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { MediaFileView } from "./MediaFileView";
import { type MediaDescriptor } from "./mediaUtils";
import { useResolvedExternalMedia } from "./useResolvedExternalMedia";

type S3MediaDescriptor = Extract<MediaDescriptor, { kind: "s3" }>;

export type ExternalMediaViewProps = {
  descriptor: S3MediaDescriptor;
};

export function ExternalMediaView({ descriptor }: ExternalMediaViewProps) {
  const projectId = useProjectIdFromURL();
  const isFeatureEnabled = useIsFeatureEnabled("externalMediaStorage", {
    enableForAdmins: false,
    projectId,
  });
  const { status, url } = useResolvedExternalMedia(descriptor, {
    enabled: isFeatureEnabled,
  });

  if (!isFeatureEnabled || status === "idle" || status === "error") {
    return (
      <span
        className="text-muted-foreground block max-w-full min-w-0 truncate text-xs"
        title={descriptor.uri}
      >
        {descriptor.uri}
      </span>
    );
  }

  if (status === "loading" || !url) {
    return <Skeleton className="h-24 w-24 max-w-full" />;
  }

  return (
    <MediaFileView
      src={url}
      contentType={descriptor.contentType}
      defaultExpanded
    />
  );
}
