import { act, renderHook } from "@testing-library/react";

import { useResolvedExternalMedia } from "./useResolvedExternalMedia";

const { queryState, refetchMock } = vi.hoisted(() => ({
  queryState: {
    data: {
      url: "https://signed.example.com/photo.jpeg",
      urlTtlSeconds: 60,
    },
    dataUpdatedAt: new Date("2026-10-09T14:04:00.000Z").getTime(),
    isError: false,
    isFetching: false,
  },
  refetchMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    media: {
      resolveExternalMedia: {
        useQuery: () => ({ ...queryState, refetch: refetchMock }),
      },
    },
  },
}));

const descriptor = {
  kind: "s3",
  contentType: "image/jpeg",
  uri: "s3://customer-bucket/media/photo.jpeg",
} as const;

describe("useResolvedExternalMedia", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T14:04:00.000Z"));
    refetchMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves as soon as it is enabled, for views without a peek", () => {
    const { result } = renderHook(() =>
      useResolvedExternalMedia(descriptor, { enabled: true }),
    );

    expect(result.current.status).toBe("ready");
    expect(result.current.url).toBe(queryState.data.url);
  });

  it("refreshes a cached signed URL when it expires before the next open", async () => {
    const { result, rerender } = renderHook(() =>
      useResolvedExternalMedia(descriptor, { enabled: true }),
    );
    await act(result.current.refreshIfNeeded);
    expect(refetchMock).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-10-09T14:06:00.000Z"));
    rerender();
    expect(result.current.url).toBeUndefined();
    await act(result.current.refreshIfNeeded);

    expect(refetchMock).toHaveBeenCalledOnce();
  });
});
