import { GetObservationsV2Query } from "@/src/features/public-api/types/observations";

describe("GetObservationsV2Query", () => {
  it("treats fields with only unknown groups like omitted fields", () => {
    const result = GetObservationsV2Query.parse({ fields: "all" });
    expect(result.fields).toBeNull();
  });
});
