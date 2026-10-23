import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useResolvedMedia } from "./useResolvedMedia";
import { useMediaPeek } from "@/src/features/media";
import { type RouterOutputs } from "@/src/utils/api";

type MediaResponse = RouterOutputs["media"]["getById"];

const { getMedia } = vi.hoisted(() => ({
  getMedia: vi.fn<() => Promise<MediaResponse>>(),
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    media: {
      getById: {
        useQuery: (
          input: { projectId: string; mediaId: string },
          options: Omit<UseQueryOptions<MediaResponse>, "queryKey" | "queryFn">,
        ) =>
          useQuery({
            ...options,
            queryKey: ["media.getById", input.projectId, input.mediaId],
            queryFn: getMedia,
          }),
      },
    },
  },
}));

const descriptor = {
  kind: "langfuseRef",
  contentType: "application/pdf",
  mediaId: "document-1",
  source: "bytes",
  referenceString:
    "@@@langfuseMedia:type=application/pdf|id=document-1|source=bytes@@@",
} as const;

const queryKey = ["media.getById", "project-1", descriptor.mediaId];
// Received at 09:00:00 (the fake clock below), valid for 60s.
const cachedMedia: MediaResponse = {
  mediaId: descriptor.mediaId,
  contentType: descriptor.contentType,
  url: "https://signed.example.com/document.pdf?signature=old",
  urlExpiry: "2026-10-22T09:01:00.000Z",
  urlTtlSeconds: 60,
  contentLength: 1024,
};
const refreshedMedia: MediaResponse = {
  ...cachedMedia,
  url: "https://signed.example.com/document.pdf?signature=new",
  urlExpiry: "2026-10-22T09:03:00.000Z",
};

describe("useResolvedMedia", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T09:00:00.000Z"));
    getMedia.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    queryClient.setQueryData(queryKey, cachedMedia);
  });

  afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  // Wires the peek to the resolver the way `MediaReferenceTag` does.
  const renderMediaHook = () =>
    renderHook(
      () => {
        const peek = useMediaPeek();
        const media = useResolvedMedia(descriptor, { enabled: peek.armed });
        const onOpenChange = (open: boolean) =>
          peek.onOpenChange(open, media.refreshIfNeeded);
        return { ...media, open: peek.open, onOpenChange };
      },
      { wrapper },
    );
  const reopenAt = (
    result: ReturnType<typeof renderMediaHook>["result"],
    time: string,
  ) => {
    act(() => result.current.onOpenChange(false));
    vi.setSystemTime(new Date(time));
    act(() => result.current.onOpenChange(true));
  };

  it("fetches nothing until the peek first opens", async () => {
    queryClient.removeQueries({ queryKey });
    getMedia.mockResolvedValue(refreshedMedia);
    const { result } = renderMediaHook();

    expect(result.current.status).toBe("idle");
    expect(getMedia).not.toHaveBeenCalled();

    act(() => result.current.onOpenChange(true));
    expect(result.current.open).toBe(true);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.url).toBe(refreshedMedia.url);
    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  it("reuses the URL early in its lifetime and renews it on reopen shortly before expiry", async () => {
    getMedia.mockResolvedValue(refreshedMedia);
    const { result } = renderMediaHook();

    act(() => result.current.onOpenChange(true));
    expect(result.current.url).toBe(cachedMedia.url);

    reopenAt(result, "2026-10-22T09:00:30.000Z");
    expect(result.current.url).toBe(cachedMedia.url);
    expect(getMedia).not.toHaveBeenCalled();

    reopenAt(result, "2026-10-22T09:00:50.000Z");
    expect(result.current.url).toBeUndefined();
    await waitFor(() => expect(result.current.url).toBe(refreshedMedia.url));
    expect(result.current.status).toBe("ready");
    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  it("renews a URL that expired in the cache before the first open", async () => {
    getMedia.mockResolvedValue(refreshedMedia);
    vi.setSystemTime(new Date("2026-10-22T09:02:00.000Z"));
    const { result } = renderMediaHook();

    act(() => result.current.onOpenChange(true));
    expect(result.current.url).toBeUndefined();
    await waitFor(() => expect(result.current.url).toBe(refreshedMedia.url));
    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  it("measures the URL lifetime on the browser clock, even when it disagrees with the server", () => {
    queryClient.setQueryData(queryKey, {
      ...cachedMedia,
      urlExpiry: "2026-10-22T07:01:00.000Z",
    });
    vi.setSystemTime(new Date("2026-10-22T09:00:10.000Z"));
    const { result } = renderMediaHook();

    act(() => result.current.onOpenChange(true));
    expect(result.current.status).toBe("ready");
    expect(result.current.url).toBe(cachedMedia.url);
    expect(getMedia).not.toHaveBeenCalled();
  });

  it("hides the expired URL while renewing and shares one request across quick reopens", async () => {
    const signing = Promise.withResolvers<MediaResponse>();
    getMedia.mockReturnValue(signing.promise);
    const { result } = renderMediaHook();
    act(() => result.current.onOpenChange(true));

    reopenAt(result, "2026-10-22T09:01:00.000Z");
    reopenAt(result, "2026-10-22T09:01:01.000Z");
    expect(result.current.status).toBe("loading");
    expect(result.current.url).toBeUndefined();
    expect(getMedia).toHaveBeenCalledTimes(1);

    await act(async () => signing.resolve(refreshedMedia));
    await waitFor(() => expect(result.current.url).toBe(refreshedMedia.url));
  });

  it("retries a failed fetch on the next open", async () => {
    queryClient.removeQueries({ queryKey });
    getMedia
      .mockRejectedValueOnce(new Error("signing failed"))
      .mockResolvedValue(refreshedMedia);
    const { result } = renderMediaHook();

    act(() => result.current.onOpenChange(true));
    await waitFor(() => expect(result.current.status).toBe("error"));

    reopenAt(result, "2026-10-22T09:00:05.000Z");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.url).toBe(refreshedMedia.url);
    expect(getMedia).toHaveBeenCalledTimes(2);
  });
});
