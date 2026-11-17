import { describe, expect, it } from "vitest";

import { selectGatewayUserSpendPage } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/selectGatewayUserSpendPage";

const rows = [
  { id: "u1", name: "Ada Lovelace", email: "ada@example.com", spendUsd: 30 },
  { id: "u2", name: "Alan Turing", email: "alan@example.com", spendUsd: 20 },
  { id: "u3", name: "Grace Hopper", email: null, spendUsd: 10 },
];

describe("selectGatewayUserSpendPage", () => {
  it("pages the users that match the search by name or email", () => {
    expect(
      selectGatewayUserSpendPage(rows, {
        searchQuery: " EXAMPLE.com ",
        pageIndex: 1,
        pageSize: 1,
      }),
    ).toEqual({ rows: [rows[1]], totalCount: 2 });
  });
});
