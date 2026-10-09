import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type MediaTagStatus } from "../../MediaTag/MediaTag";
import { type MediaDescriptor } from "./mediaUtils";

type S3MediaDescriptor = Extract<MediaDescriptor, { kind: "s3" }>;

export function useResolvedExternalMedia(
  descriptor: S3MediaDescriptor,
  { enabled }: { enabled: boolean },
): {
  status: MediaTagStatus;
  url?: string;
  refresh: () => void;
} {
  const projectId = useProjectIdFromURL();
  const query = api.media.resolveExternalMedia.useQuery(
    { projectId: projectId ?? "", uri: descriptor.uri },
    {
      enabled: enabled && Boolean(projectId),
      retry: false,
      meta: { silentHttpCodes: [404] },
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 4 * 60 * 1000,
    },
  );
  const refresh = () => {
    void query.refetch();
  };

  if (!enabled || !projectId) {
    return { status: "idle", refresh };
  }
  if (query.isError) {
    return { status: "error", refresh };
  }
  if (
    query.data?.expiresAt !== undefined &&
    query.data.expiresAt.getTime() <= Date.now()
  ) {
    return { status: "error", refresh };
  }
  if (query.data?.url) {
    return { status: "ready", url: query.data.url, refresh };
  }
  return { status: "loading", refresh };
}
