import { render, screen } from "@testing-library/react";
import { AGENT_LIMITS } from "@langfuse/shared/agents";
import { AgentPagination } from "./AgentPagination";

it("stops at the supported page and explains how to reach the remaining results", () => {
  render(
    <AgentPagination
      totalCount={50000}
      state={{ pageIndex: AGENT_LIMITS.maxPage, pageSize: 20 }}
      onChange={() => {}}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Go to next page" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Go to last page" }),
  ).toBeDisabled();
  expect(screen.getByText(/50,000 results/)).toBeInTheDocument();
  expect(
    screen.getByText(/Narrow the time range or environment/),
  ).toBeInTheDocument();
});
