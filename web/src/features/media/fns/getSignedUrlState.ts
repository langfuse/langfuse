import { type UseQueryResult } from "@tanstack/react-query";
import { type MediaTagStatus } from "@/src/components/MediaTag/MediaTag";

const RENEWAL_MARGIN_FRACTION = 0.25;
const MAX_RENEWAL_MARGIN_MS = 30_000;

/**
 * Turns a signed-URL query into what a media view renders: the status, the URL
 * while it is still usable, and `refreshIfNeeded`, which fetches a new URL only
 * when the cached one is about to expire or the last fetch failed.
 *
 * Expiry is measured on the browser clock from `dataUpdatedAt` plus the
 * server-reported lifetime, so server/browser clock skew cannot flip it. The
 * early margin absorbs network latency and leaves time to click the link.
 */
export function getSignedUrlState(
  query: SignedUrlQuery,
  { enabled, projectId }: { enabled: boolean; projectId?: string | null },
): {
  status: MediaTagStatus;
  url?: string;
  contentLength?: number;
  refreshIfNeeded: () => Promise<void>;
} {
  const isUnusable = () => {
    if (query.isError) return true;
    const urlTtlSeconds = query.data?.urlTtlSeconds;
    if (urlTtlSeconds === undefined) return false;
    const lifetime = urlTtlSeconds * 1000;
    const margin = Math.min(
      MAX_RENEWAL_MARGIN_MS,
      lifetime * RENEWAL_MARGIN_FRACTION,
    );
    return query.dataUpdatedAt + lifetime - margin <= Date.now();
  };
  const refreshIfNeeded = async () => {
    if (!projectId || !isUnusable()) return;
    await query.refetch({ cancelRefetch: false });
  };

  if (!enabled || !projectId) return { status: "idle", refreshIfNeeded };
  if (isUnusable()) {
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

type SignedUrlQuery = Pick<
  UseQueryResult<
    { url: string; contentLength?: number; urlTtlSeconds: number },
    unknown
  >,
  "data" | "dataUpdatedAt" | "isError" | "isFetching" | "refetch"
>;
