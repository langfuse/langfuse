import { fireEvent, render, screen } from "@testing-library/react";

import { PeekTableStateProvider } from "@/src/components/table/peek/contexts/PeekTableStateContext";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";

vi.mock("use-query-params", () => {
  const React = require("react");

  return {
    ObjectParam: {},
    withDefault: (_param: unknown, defaultValue: unknown) => ({
      defaultValue,
    }),
    useQueryParam: (
      _key: string,
      config: {
        defaultValue: unknown;
      },
    ) => React.useState(config.defaultValue),
  };
});

function Harness() {
  const [orderBy, setOrderBy] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

  return (
    <>
      <div data-testid="order-by">
        {orderBy ? `${orderBy.column}:${orderBy.order}` : "none"}
      </div>
      <button
        type="button"
        onClick={() => setOrderBy({ column: "name", order: "ASC" })}
      >
        Sort by name
      </button>
      <button type="button" onClick={() => setOrderBy(null)}>
        Disable sorting
      </button>
    </>
  );
}

describe("useOrderByState in peek table state", () => {
  it("uses the table default until peek-local sorting is changed", () => {
    render(
      <PeekTableStateProvider>
        <Harness />
      </PeekTableStateProvider>,
    );

    expect(screen.getByTestId("order-by")).toHaveTextContent("timestamp:DESC");

    fireEvent.click(screen.getByRole("button", { name: "Sort by name" }));

    expect(screen.getByTestId("order-by")).toHaveTextContent("name:ASC");
  });

  it("preserves an explicit peek-local sorting reset", () => {
    render(
      <PeekTableStateProvider>
        <Harness />
      </PeekTableStateProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sort by name" }));
    fireEvent.click(screen.getByRole("button", { name: "Disable sorting" }));

    expect(screen.getByTestId("order-by")).toHaveTextContent("none");
  });
});
