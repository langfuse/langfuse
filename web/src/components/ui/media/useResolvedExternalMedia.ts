import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { getSignedUrlState } from "@/src/features/media";
import { type MediaDescriptor } from "./mediaUtils";

export function useResolvedExternalMedia(
  descriptor: S3MediaDescriptor,
  { enabled }: { enabled: boolean },
) {
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

  return getSignedUrlState(query, { enabled, projectId });
}

type S3MediaDescriptor = Extract<MediaDescriptor, { kind: "s3" }>;
