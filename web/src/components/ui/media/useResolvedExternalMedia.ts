import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type MediaTagStatus } from "../../MediaTag/MediaTag";
import { type MediaDescriptor } from "./mediaUtils";

export function useResolvedExternalMedia(
  descriptor: S3MediaDescriptor,
  { enabled }: { enabled: boolean },
): {
  status: MediaTagStatus;
  url?: string;
  contentLength?: number;
  refresh: () => Promise<void>;
  refreshIfNeeded: () => Promise<void>;
} {
  const projectId = useProjectIdFromURL();
  const query = api.media.resolveExternalMedia.useQuery(
    { projectId: projectId ?? "", uri: descriptor.uri },
    {
      enabled: enabled && Boolean(projectId),
      retry: false,
      meta: { silentHttpCodes: [404] },
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
      staleTime: 4 * 60 * 1000,
    },
  );
  const refreshIfNeeded = async () => {
    if (!query.isError && !isExpired(query.data?.expiresAt)) return;
    await query.refetch();
  };
  const refresh = async () => {
    await query.refetch();
  };

  if (!enabled || !projectId) {
    return { status: "idle", refresh, refreshIfNeeded };
  }
  if (query.isError) {
    return { status: "error", refresh, refreshIfNeeded };
  }
  if (isExpired(query.data?.expiresAt)) {
    return {
      status: query.isFetching ? "loading" : "error",
      refresh,
      refreshIfNeeded,
    };
  }
  if (query.data?.url) {
    return {
      status: "ready",
      url: query.data.url,
      contentLength: query.data.contentLength,
      refresh,
      refreshIfNeeded,
    };
  }
  return { status: "loading", refresh, refreshIfNeeded };
}

function isExpired(expiresAt?: Date) {
  return expiresAt !== undefined && expiresAt.getTime() <= Date.now();
}

type S3MediaDescriptor = Extract<MediaDescriptor, { kind: "s3" }>;
