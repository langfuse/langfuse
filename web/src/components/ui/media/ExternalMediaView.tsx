import { useRef } from "react";

import { Skeleton } from "@/src/components/ui/skeleton";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import { type MediaContentType } from "@/src/features/media";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { PREVIEW_AUTO_EXPAND_MAX_BYTES } from "./mediaConstants";
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
  const refreshedAfterErrorUrl = useRef<string | undefined>(undefined);
  const { status, url, contentLength, refresh, refreshIfNeeded } =
    useResolvedExternalMedia(descriptor, {
      enabled: true,
    });

  if (status === "idle" || status === "error") {
    return <ExternalMediaFallback uri={descriptor.uri} />;
  }

  if (status === "loading" || !url) {
    return <Skeleton className="h-24 w-24 max-w-full" />;
  }

  const refreshBeforePreview = () => {
    void refreshIfNeeded();
  };
  const refreshAfterError = () => {
    if (refreshedAfterErrorUrl.current === url) return;
    refreshedAfterErrorUrl.current = url;
    void refresh();
  };

  return (
    <MediaFileView
      src={url}
      contentType={descriptor.contentType as MediaContentType}
      defaultExpanded={
        contentLength !== undefined &&
        contentLength <= PREVIEW_AUTO_EXPAND_MAX_BYTES
      }
      onPreviewError={refreshAfterError}
      onPreviewRequest={refreshBeforePreview}
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
