import {
  formatSdkVersion,
  getV4MigrationSdkStatus,
} from "@/src/features/v4-migration/sdkVersionStatus";

const baseState = {
  checkedAt: "2026-07-23T10:00:00.000Z",
  isRefreshing: false,
  querySettled: false,
  isError: false,
};

describe("v4 migration SDK status", () => {
  it.each([
    ["javascript", "5.4.0", "latest"],
    ["javascript", "5.3.9", "legacy"],
    ["python", "4.7.0", "latest"],
    ["python", "4.6.9", "legacy"],
  ] as const)("classifies %s %s as %s", (language, version, expected) => {
    expect(
      getV4MigrationSdkStatus({
        ...baseState,
        sdkVersion: { language, version },
      }),
    ).toBe(expected);
  });

  it("distinguishes an in-flight first check from an unknown result", () => {
    expect(
      getV4MigrationSdkStatus({
        sdkVersion: undefined,
        checkedAt: null,
        isRefreshing: true,
        querySettled: false,
        isError: false,
      }),
    ).toBe("checking");
    expect(
      getV4MigrationSdkStatus({
        ...baseState,
        sdkVersion: { language: null, version: null },
        querySettled: true,
      }),
    ).toBe("unknown");
  });

  it("distinguishes a failed first check from an unknown SDK", () => {
    expect(
      getV4MigrationSdkStatus({
        sdkVersion: undefined,
        checkedAt: null,
        isRefreshing: false,
        querySettled: false,
        isError: true,
      }),
    ).toBe("error");
  });

  it("formats detected SDK versions for migration copy", () => {
    expect(formatSdkVersion({ language: "javascript", version: "5.4.1" })).toBe(
      "JavaScript 5.4.1",
    );
    expect(formatSdkVersion({ language: null, version: null })).toBeNull();
  });
});
