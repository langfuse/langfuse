import { getAvailableCloudRegionOptions } from "@/src/features/organizations/cloudRegions";

describe("getAvailableCloudRegionOptions", () => {
  it("includes the Japan region in the default cloud selector options", () => {
    expect(
      getAvailableCloudRegionOptions("EU").map((region) => region.name),
    ).toEqual(["US", "EU", "JP", "HIPAA"]);
  });
});
