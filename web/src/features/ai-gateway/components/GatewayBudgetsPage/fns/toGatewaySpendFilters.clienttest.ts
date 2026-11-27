import { singleFilter } from "@langfuse/shared";

import { toGatewaySpendFilters } from "./toGatewaySpendFilters";

describe("toGatewaySpendFilters", () => {
  it("builds a valid filter for an empty selection", () => {
    for (const filter of toGatewaySpendFilters("users", [])) {
      expect(singleFilter.safeParse(filter).success).toBe(true);
    }
  });
});
