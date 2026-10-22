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

type MediaResponse = {
  url: string;
  urlExpiry: string;
  contentLength: number;
};

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
const cachedMedia: MediaResponse = {
  url: "https://signed.example.com/document.pdf?signature=old",
  urlExpiry: "2026-10-22T09:01:00.000Z",
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

  it("reuses a cached URL while it is valid", async () => {
    const { result } = renderHook(
      () => useResolvedMedia(descriptor, { enabled: true }),
      { wrapper },
    );

    expect(result.current.status).toBe("ready");
    expect(result.current.url).toBe(cachedMedia.url);
    await act(result.current.refreshIfNeeded);
    expect(getMedia).not.toHaveBeenCalled();
  });

  it("does not expose a URL that expired before the cache became stale", () => {
    const { result, rerender } = renderHook(
      () => useResolvedMedia(descriptor, { enabled: true }),
      { wrapper },
    );

    act(() => vi.setSystemTime(new Date(cachedMedia.urlExpiry)));
    rerender();

    expect(result.current.status).not.toBe("ready");
    expect(result.current.url).toBeUndefined();
  });

  it.each([true, false])(
    "refreshes an expired cached URL on open (previously enabled: %s)",
    async (enabled) => {
      getMedia.mockResolvedValue(refreshedMedia);
      const { result, rerender } = renderHook(
        ({ enabled }) => useResolvedMedia(descriptor, { enabled }),
        { initialProps: { enabled }, wrapper },
      );
      vi.setSystemTime(new Date(cachedMedia.urlExpiry));

      await act(async () => {
        await result.current.refreshIfNeeded();
      });
      rerender({ enabled: true });

      await waitFor(() => expect(result.current.url).toBe(refreshedMedia.url));
      expect(result.current.status).toBe("ready");
      expect(getMedia).toHaveBeenCalledTimes(1);
    },
  );

  it("hides the expired URL during renewal and shares concurrent refreshes", async () => {
    let completeSigningRequest!: (media: MediaResponse) => void;
    getMedia.mockImplementation(
      () =>
        new Promise<MediaResponse>((resolve) => {
          completeSigningRequest = resolve;
        }),
    );
    const { result } = renderHook(
      () => useResolvedMedia(descriptor, { enabled: true }),
      { wrapper },
    );
    vi.setSystemTime(new Date(cachedMedia.urlExpiry));

    let firstRefresh!: Promise<void>;
    let secondRefresh!: Promise<void>;
    act(() => {
      firstRefresh = result.current.refreshIfNeeded();
      secondRefresh = result.current.refreshIfNeeded();
    });
    await waitFor(() => expect(result.current.status).toBe("loading"));
    expect(result.current.url).toBeUndefined();
    expect(getMedia).toHaveBeenCalledTimes(1);

    await act(async () => {
      completeSigningRequest(refreshedMedia);
      await Promise.all([firstRefresh, secondRefresh]);
    });
    await waitFor(() => expect(result.current.url).toBe(refreshedMedia.url));
  });

  it("allows another open to retry a failed renewal without exposing the expired URL", async () => {
    getMedia.mockRejectedValueOnce(new Error("Signing request failed"));
    const { result } = renderHook(
      () => useResolvedMedia(descriptor, { enabled: true }),
      { wrapper },
    );
    vi.setSystemTime(new Date(cachedMedia.urlExpiry));

    await act(result.current.refreshIfNeeded);
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.url).toBeUndefined();

    getMedia.mockResolvedValue(refreshedMedia);
    await act(result.current.refreshIfNeeded);

    await waitFor(() => expect(result.current.url).toBe(refreshedMedia.url));
    expect(getMedia).toHaveBeenCalledTimes(2);
  });
});
