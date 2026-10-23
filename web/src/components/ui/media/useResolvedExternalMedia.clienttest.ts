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

  it("refreshes a cached signed URL when it expires before the next open", () => {
    const { result } = renderHook(() =>
      useResolvedExternalMedia(descriptor, { enabled: true }),
    );
    expect(result.current.status).toBe("idle");

    act(() => result.current.onOpenChange(true));
    expect(result.current.status).toBe("ready");
    expect(refetchMock).not.toHaveBeenCalled();

    act(() => result.current.onOpenChange(false));
    vi.setSystemTime(new Date("2026-10-09T14:06:00.000Z"));
    act(() => result.current.onOpenChange(true));

    expect(refetchMock).toHaveBeenCalledOnce();
  });

  it("does not fetch while external media is disabled", () => {
    vi.setSystemTime(new Date("2026-10-09T14:06:00.000Z"));
    const { result } = renderHook(() =>
      useResolvedExternalMedia(descriptor, { enabled: false }),
    );

    act(() => result.current.onOpenChange(true));
    expect(result.current.status).toBe("idle");
    expect(refetchMock).not.toHaveBeenCalled();
  });
});
