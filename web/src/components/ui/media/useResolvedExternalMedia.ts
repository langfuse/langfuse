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

  if (!enabled || !projectId) {
    return { status: "idle", refreshIfNeeded };
  }
  if (query.isError) {
    return { status: "error", refreshIfNeeded };
  }
  if (isExpired(query.data?.expiresAt)) {
    return {
      status: query.isFetching ? "loading" : "error",
      refreshIfNeeded,
    };
  }
  if (query.data?.url) {
    return {
      status: "ready",
      url: query.data.url,
      contentLength: query.data.contentLength,
      refreshIfNeeded,
    };
  }
  return { status: "loading", refreshIfNeeded };
}

function isExpired(expiresAt?: Date) {
  return expiresAt !== undefined && expiresAt.getTime() <= Date.now();
}

type S3MediaDescriptor = Extract<MediaDescriptor, { kind: "s3" }>;
