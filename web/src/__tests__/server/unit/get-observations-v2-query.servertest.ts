import { OBSERVATION_FIELD_GROUPS_PUBLIC_API } from "@langfuse/shared";

import { GetObservationsV2Query } from "@/src/features/public-api/types/observations";

describe("GetObservationsV2Query fields", () => {
  it("treats fields=all as every public API field group", () => {
    const parsed = GetObservationsV2Query.parse({ fields: "all" });

    expect(parsed.fields).toEqual([...OBSERVATION_FIELD_GROUPS_PUBLIC_API]);
  });

  it("expands all even when mixed with other group names", () => {
    const parsed = GetObservationsV2Query.parse({
      fields: "basic,all,metrics",
    });

    expect(parsed.fields).toEqual([...OBSERVATION_FIELD_GROUPS_PUBLIC_API]);
  });

  it("defaults when only unknown groups are sent", () => {
    const parsed = GetObservationsV2Query.parse({ fields: "all_typo,extra" });

    expect(parsed.fields).toBeNull();
  });

  it("keeps an explicit metrics request", () => {
    const parsed = GetObservationsV2Query.parse({
      fields: "metrics,unknown",
    });

    expect(parsed.fields).toEqual(["metrics"]);
  });

  it("leaves an omitted fields parameter as null", () => {
    const parsed = GetObservationsV2Query.parse({});

    expect(parsed.fields).toBeNull();
  });
});
