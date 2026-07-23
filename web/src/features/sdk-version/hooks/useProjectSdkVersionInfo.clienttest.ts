import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import {
  useProjectSdkVersionInfo,
  useProjectsSdkVersionInfo,
} from "@/src/features/sdk-version/hooks/useProjectSdkVersionInfo";
import { persistProjectSdkVersionInfo } from "@/src/features/sdk-version/lib/sdkVersionStorage";
import { sdkVersionStorageKeys } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

const apiMocks = vi.hoisted(() => ({
  getSdkVersionInfo: vi.fn(),
  queryResults: [] as unknown[],
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useQueries: (
      buildQueries: (router: {
        events: { getSdkVersionInfo: typeof apiMocks.getSdkVersionInfo };
      }) => unknown,
    ) => {
      buildQueries({
        events: { getSdkVersionInfo: apiMocks.getSdkVersionInfo },
      });
      return apiMocks.queryResults;
    },
  },
}));

const storageValues = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return storageValues.size;
  },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => Array.from(storageValues.keys())[index] ?? null,
  removeItem: (key) => {
    storageValues.delete(key);
  },
  setItem: (key, value) => {
    storageValues.set(key, value);
  },
};

const pendingQuery = {
  data: undefined,
  dataUpdatedAt: 0,
  isFetching: true,
  isSuccess: false,
  isError: false,
};

describe("project SDK version hook", () => {
  beforeAll(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
    apiMocks.getSdkVersionInfo.mockReset();
    apiMocks.queryResults = [];
  });

  it("returns cached data immediately while refreshing in the background", () => {
    persistProjectSdkVersionInfo(
      "project-1",
      { language: "javascript", version: "5.4.0" },
      "2026-07-23T10:00:00.000Z",
    );
    apiMocks.queryResults = [pendingQuery];

    const { result } = renderHook(() =>
      useProjectSdkVersionInfo({
        projectId: "project-1",
        enabled: true,
        refreshMode: "always",
      }),
    );

    expect(result.current).toMatchObject({
      sdkVersion: { language: "javascript", version: "5.4.0" },
      isRefreshing: true,
    });
    expect(apiMocks.getSdkVersionInfo).toHaveBeenCalledWith(
      { projectId: "project-1" },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("creates one non-blocking query per project", () => {
    apiMocks.queryResults = [pendingQuery, pendingQuery];

    renderHook(() =>
      useProjectsSdkVersionInfo({
        projectIds: ["project-1", "project-2"],
        enabled: true,
        refreshMode: "always",
      }),
    );

    expect(apiMocks.getSdkVersionInfo).toHaveBeenCalledTimes(2);
    expect(apiMocks.getSdkVersionInfo).toHaveBeenNthCalledWith(
      1,
      { projectId: "project-1" },
      expect.objectContaining({
        enabled: true,
        refetchOnWindowFocus: false,
        retry: false,
      }),
    );
    expect(apiMocks.getSdkVersionInfo).toHaveBeenNthCalledWith(
      2,
      { projectId: "project-2" },
      expect.objectContaining({ enabled: true }),
    );
  });

  it.each([
    ["fresh", new Date().toISOString(), false],
    ["stale", new Date(Date.now() - 31 * 86_400_000).toISOString(), true],
  ] as const)(
    "sets the app-root query enabled state for a %s cache",
    (_cacheState, checkedAt, enabled) => {
      persistProjectSdkVersionInfo(
        "project-1",
        { language: "python", version: "4.7.0" },
        checkedAt,
      );
      apiMocks.queryResults = [
        enabled ? pendingQuery : { ...pendingQuery, isFetching: false },
      ];

      renderHook(() =>
        useProjectSdkVersionInfo({
          projectId: "project-1",
          enabled: true,
          refreshMode: "if-stale",
        }),
      );

      expect(apiMocks.getSdkVersionInfo).toHaveBeenCalledWith(
        { projectId: "project-1" },
        expect.objectContaining({ enabled }),
      );
    },
  );

  it("persists a settled query in the shared app-root cache", async () => {
    const checkedAt = new Date("2026-07-23T10:00:00.000Z").getTime();
    apiMocks.queryResults = [
      {
        data: { isOtel: true, name: "python", version: "4.7.1" },
        dataUpdatedAt: checkedAt,
        isFetching: false,
        isSuccess: true,
        isError: false,
      },
    ];

    const { result } = renderHook(() =>
      useProjectSdkVersionInfo({
        projectId: "project-1",
        enabled: true,
        refreshMode: "always",
      }),
    );

    expect(result.current).toMatchObject({
      sdkVersion: { language: "python", version: "4.7.1" },
      checkedAt: new Date(checkedAt).toISOString(),
      querySettled: true,
    });

    const keys = sdkVersionStorageKeys("project-1");
    await waitFor(() => {
      expect(window.localStorage.getItem(keys.language)).toBe("python");
      expect(window.localStorage.getItem(keys.version)).toBe("4.7.1");
      expect(window.localStorage.getItem(keys.checkedAt)).toBe(
        new Date(checkedAt).toISOString(),
      );
    });
  });
});
