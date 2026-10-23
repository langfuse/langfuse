import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { isSignedUrlExpired, type MediaDescriptor } from "./mediaUtils";
import { type MediaTagStatus } from "../../MediaTag/MediaTag";

type LangfuseRefDescriptor = Extract<MediaDescriptor, { kind: "langfuseRef" }>;

/**
 * Resolves the previewable URL for a media descriptor.
 *
 * URLs are resolved lazily when media opens, so a JSON view with N media leaves
 * does not fetch N URLs on render. Cached URLs are reused until shortly before
 * their returned expiry; callers check for renewal when opening media.
 */
export function useResolvedMedia(
  descriptor: LangfuseRefDescriptor,
  { enabled }: { enabled: boolean },
): {
  status: MediaTagStatus;
  url?: string;
  contentLength?: number;
  refreshIfNeeded: () => Promise<void>;
} {
  const projectId = useProjectIdFromURL();

  const { data, dataUpdatedAt, isError, isFetching, refetch } =
    api.media.getById.useQuery(
      {
        mediaId: descriptor.mediaId,
        projectId: projectId as string,
      },
      {
        enabled: enabled && Boolean(projectId),
        meta: { silentHttpCodes: [404] },
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        staleTime: 55 * 60 * 1000,
      },
    );
  const isExpired = () => isSignedUrlExpired(data?.urlExpiry, dataUpdatedAt);

  const refreshIfNeeded = async () => {
    if (!projectId || (!isError && !isExpired())) return;
    await refetch({ cancelRefetch: false });
  };

  if (!enabled || !projectId) return { status: "idle", refreshIfNeeded };
  if (isExpired()) {
    return {
      status: isFetching ? "loading" : "error",
      refreshIfNeeded,
    };
  }
  if (isError) return { status: "error", refreshIfNeeded };
  if (data?.url)
    return {
      status: "ready",
      url: data.url,
      contentLength: data.contentLength,
      refreshIfNeeded,
    };
  return { status: "loading", refreshIfNeeded };
}
