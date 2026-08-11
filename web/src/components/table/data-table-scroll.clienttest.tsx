import { fireEvent, render } from "@testing-library/react";
import { vi } from "vitest";

import { DataTable } from "./data-table";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

describe("DataTable scrolling", () => {
  it("forwards scroll events from the table's inner scroll container", () => {
    const onScroll = vi.fn();
    const { container } = render(
      <DataTable
        tableName="scroll-test"
        columns={[
          {
            accessorKey: "name",
            id: "name",
            header: "Name",
          },
        ]}
        data={{
          isLoading: false,
          isError: false,
          data: [{ id: "row-1", name: "First row" }],
        }}
        hidePagination
        onScroll={onScroll}
      />,
    );

    const outerContainer = container.firstElementChild;
    const innerContainer = outerContainer?.firstElementChild;
    expect(innerContainer).toBeInstanceOf(HTMLDivElement);

    fireEvent.scroll(innerContainer!);

    expect(onScroll).toHaveBeenCalledOnce();
  });
});
