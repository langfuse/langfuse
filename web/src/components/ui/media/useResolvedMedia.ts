import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { getSignedUrlState, mediaUrlQueryOptions } from "@/src/features/media";
import { type MediaDescriptor } from "./mediaUtils";

type LangfuseRefDescriptor = Extract<MediaDescriptor, { kind: "langfuseRef" }>;

/**
 * Resolves the previewable URL for a native media reference once `enabled`.
 *
 * Chips enable it when their peek first opens (`useMediaPeek`), so a JSON view
 * with N media leaves does not fetch N URLs on render. Cached URLs are reused
 * until shortly before they expire; `refreshIfNeeded` fetches a new one.
 */
export function useResolvedMedia(
  descriptor: LangfuseRefDescriptor,
  { enabled }: { enabled: boolean },
) {
  const projectId = useProjectIdFromURL();
  const query = api.media.getById.useQuery(
    {
      mediaId: descriptor.mediaId,
      projectId: projectId as string,
    },
    {
      enabled: enabled && Boolean(projectId),
      ...mediaUrlQueryOptions,
    },
  );

  return getSignedUrlState(query, { enabled, projectId });
}
