import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type MediaDescriptor } from "./mediaUtils";
import { type MediaTagStatus } from "./MediaTag";

type LangfuseRefDescriptor = Extract<MediaDescriptor, { kind: "langfuseRef" }>;

/**
 * Resolves the previewable URL for a media descriptor.
 *
 * - Langfuse refs fetch a presigned S3 URL via tRPC, but only once `enabled`
 *   flips true (the peek opens) — this is what keeps a JSON view with N media
 *   leaves from firing N `getById` requests on render. Query config mirrors
 *   `LangfuseMediaView` (55-min staleTime ≈ S3 link TTL), so re-hovers are
 *   served from cache.
 */
export function useResolvedMedia(
  descriptor: LangfuseRefDescriptor,
  { enabled }: { enabled: boolean },
): { status: MediaTagStatus; url?: string } {
  const projectId = useProjectIdFromURL();

  const query = api.media.getById.useQuery(
    {
      mediaId: descriptor.mediaId,
      projectId: projectId as string,
    },
    {
      enabled: enabled && Boolean(projectId),
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 55 * 60 * 1000, // S3 links expire after 1 hour
    },
  );

  if (!enabled || !projectId) return { status: "idle" };
  if (query.isError) return { status: "error" };
  if (query.data?.url) return { status: "ready", url: query.data.url };
  return { status: "loading" };
}
