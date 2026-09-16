import { GetObservationsV2Query } from "@/src/features/public-api/types/observations";

describe("GetObservationsV2Query session duration", () => {
  it("leaves session filtering disabled by default", () => {
    expect(GetObservationsV2Query.parse({}).minSessionDuration).toBeUndefined();
  });

  it.each(["0", "60", "60.5"])("accepts %s seconds", (value) => {
    expect(
      GetObservationsV2Query.parse({ minSessionDuration: value })
        .minSessionDuration,
    ).toBe(Number(value));
  });

  it.each(
    ["-1", "NaN", "Infinity", "invalid", "", " ", ["1", "2"]].map((value) => ({
      value,
    })),
  )("rejects invalid duration %j", ({ value }) => {
    expect(
      GetObservationsV2Query.safeParse({ minSessionDuration: value }).success,
    ).toBe(false);
  });
});
