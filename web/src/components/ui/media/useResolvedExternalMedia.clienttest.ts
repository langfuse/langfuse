import { act, renderHook } from "@testing-library/react";

import { useResolvedExternalMedia } from "./useResolvedExternalMedia";

const { queryState, refetchMock } = vi.hoisted(() => ({
  queryState: {
    data: {
      url: "https://signed.example.com/photo.jpeg",
      expiresAt: new Date("2026-10-09T14:05:00.000Z"),
      contentLength: 42,
    },
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

  it("refreshes a cached signed URL when it expires before the next open", async () => {
    const { result } = renderHook(() =>
      useResolvedExternalMedia(descriptor, { enabled: true }),
    );

    expect(result.current.status).toBe("ready");
    expect(result.current.contentLength).toBe(42);

    vi.setSystemTime(new Date("2026-10-09T14:06:00.000Z"));
    await act(result.current.refreshIfNeeded);

    expect(refetchMock).toHaveBeenCalledOnce();
  });

  it("forces a new signed URL after a media element reports an error", async () => {
    const { result } = renderHook(() =>
      useResolvedExternalMedia(descriptor, { enabled: true }),
    );

    await act(result.current.refresh);

    expect(refetchMock).toHaveBeenCalledOnce();
  });
});
