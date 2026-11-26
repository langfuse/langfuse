// @vitest-environment node

import { getExternalMediaStorageStatus } from "./useExternalMediaStorage";

describe("getExternalMediaStorageStatus", () => {
  it.each([
    [null, undefined],
    [{ bucketName: "media" }, "active"],
  ])("maps %o to %s", (config, expected) => {
    expect(getExternalMediaStorageStatus(config)).toBe(expected);
  });
});
