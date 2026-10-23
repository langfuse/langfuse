import { useState } from "react";
import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { isSignedUrlExpired, type MediaDescriptor } from "./mediaUtils";
import { type MediaTagStatus } from "../../MediaTag/MediaTag";

type LangfuseRefDescriptor = Extract<MediaDescriptor, { kind: "langfuseRef" }>;

/**
 * Drives the peek of a native media chip and resolves its signed URL.
 *
 * The URL is fetched lazily on the first open, so a JSON view with N media
 * leaves does not fetch N URLs on render. Later opens reuse the cached URL
 * until shortly before it expires, then fetch a new one.
 */
export function useResolvedMedia(descriptor: LangfuseRefDescriptor): {
  status: MediaTagStatus;
  url?: string;
  contentLength?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
} {
  const projectId = useProjectIdFromURL();
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);

  const { data, dataUpdatedAt, isError, isFetching, refetch } =
    api.media.getById.useQuery(
      {
        mediaId: descriptor.mediaId,
        projectId: projectId as string,
      },
      {
        enabled: armed && Boolean(projectId),
        meta: { silentHttpCodes: [404] },
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        staleTime: 55 * 60 * 1000,
      },
    );
  const isExpired = () =>
    isSignedUrlExpired(data?.urlTtlSeconds, dataUpdatedAt);

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;

    setArmed(true);
    if (projectId && (isError || isExpired())) {
      refetch({ cancelRefetch: false }).catch(() => undefined);
    }
  };

  const peek = { open, onOpenChange };
  if (!armed || !projectId) return { status: "idle", ...peek };
  if (isExpired()) {
    return { status: isFetching ? "loading" : "error", ...peek };
  }
  if (isError) return { status: "error", ...peek };
  if (data?.url) {
    return {
      status: "ready",
      url: data.url,
      contentLength: data.contentLength,
      ...peek,
    };
  }
  return { status: "loading", ...peek };
}
