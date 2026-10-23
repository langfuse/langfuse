import { useState } from "react";
import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type MediaTagStatus } from "../../MediaTag/MediaTag";
import { isSignedUrlExpired, type MediaDescriptor } from "./mediaUtils";

/**
 * Drives the peek of an external S3 media chip and resolves its signed URL.
 * Fetches lazily on the first open (only while `enabled`) and fetches a new
 * URL on a later open once the cached one is about to expire or failed.
 */
export function useResolvedExternalMedia(
  descriptor: S3MediaDescriptor,
  { enabled }: { enabled: boolean },
): {
  status: MediaTagStatus;
  url?: string;
  contentLength?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
} {
  const projectId = useProjectIdFromURL();
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const canFetch = enabled && Boolean(projectId);
  const query = api.media.resolveExternalMedia.useQuery(
    { projectId: projectId ?? "", uri: descriptor.uri },
    {
      enabled: canFetch && armed,
      retry: false,
      meta: { silentHttpCodes: [404] },
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
      staleTime: 4 * 60 * 1000,
    },
  );
  const isExpired = () =>
    isSignedUrlExpired(query.data?.urlTtlSeconds, query.dataUpdatedAt);

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;

    setArmed(true);
    if (canFetch && (query.isError || isExpired())) {
      query.refetch({ cancelRefetch: false }).catch(() => undefined);
    }
  };

  const peek = { open, onOpenChange };
  if (!canFetch || !armed) return { status: "idle", ...peek };
  if (query.isError) return { status: "error", ...peek };
  if (isExpired()) {
    return { status: query.isFetching ? "loading" : "error", ...peek };
  }
  if (query.data?.url) {
    return {
      status: "ready",
      url: query.data.url,
      contentLength: query.data.contentLength,
      ...peek,
    };
  }
  return { status: "loading", ...peek };
}

type S3MediaDescriptor = Extract<MediaDescriptor, { kind: "s3" }>;
