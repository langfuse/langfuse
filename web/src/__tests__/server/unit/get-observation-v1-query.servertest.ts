import { GetObservationV1Query } from "@/src/features/public-api/types/observations";

describe("GetObservationV1Query", () => {
  it("parses without startTime (backwards compatible)", () => {
    const result = GetObservationV1Query.safeParse({
      observationId: "obs-1",
    });
    expect(result.success).toBe(true);
    expect(result.data?.startTime).toBeUndefined();
  });

  it("accepts an ISO datetime with a timezone offset", () => {
    const result = GetObservationV1Query.safeParse({
      observationId: "obs-1",
      startTime: "2024-03-15T08:30:00.000Z",
    });
    expect(result.success).toBe(true);
    expect(result.data?.startTime).toBe("2024-03-15T08:30:00.000Z");
  });

  it("rejects a datetime without a timezone offset", () => {
    const result = GetObservationV1Query.safeParse({
      observationId: "obs-1",
      startTime: "2024-03-15T08:30:00",
    });
    expect(result.success).toBe(false);
  });
});
