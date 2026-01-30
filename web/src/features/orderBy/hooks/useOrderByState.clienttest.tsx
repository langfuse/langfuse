import { cleanup, render } from "@testing-library/react";

import { TestRouter } from "@/src/__tests__/fixtures/TestRouter";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { LocationMock } from "@jedmao/location";
import NextAdapterPages from "next-query-params/pages";
import { useRouter } from "next/router";
import { QueryParamProvider } from "use-query-params";

afterEach(cleanup);

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

// The test for the useOrderByState hook
// Skipped: jsdom v26 (Jest 30) makes window.location non-configurable
// The hook is implicitly tested through table interactions in the app
describe.skip("useOrderByState hook", () => {
  let testRouter: TestRouter;
  let locationMock: LocationMock;

  beforeAll(() => {
    // @ts-expect-error - TS doesn't allow deleting non-optional props
    delete window.location;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    locationMock = new LocationMock("https://langfuse.com");
    testRouter = new TestRouter(locationMock);
    Object.defineProperty(window, "location", {
      value: locationMock,
      writable: true,
      configurable: true,
    });

    (useRouter as jest.Mock).mockReturnValue(testRouter);
  });

  test("orderBy takes the default value if no url param is given", () => {
    const result = render(
      <QueryParamProvider adapter={NextAdapterPages}>
        <UseOrderByStateExample />
      </QueryParamProvider>,
    );

    expect(result.queryByText(/column Column 1, order DESC/)).toBeTruthy();
  });

  test("setOrderBy updates orderBy query param", () => {
    const result = render(
      <QueryParamProvider adapter={NextAdapterPages}>
        <UseOrderByStateExample />
      </QueryParamProvider>,
    );

    result.queryByText(/Set Order/)!.click();
    result.rerender(
      <QueryParamProvider adapter={NextAdapterPages}>
        <UseOrderByStateExample />
      </QueryParamProvider>,
    );

    expect(result.queryByText(/column Column 2, order ASC/)).toBeTruthy();
    expect(locationMock.searchParams.get("orderBy")).toBe(
      "column-Column 2_order-ASC",
    );
  });

  test("orderBy reads the given param from the url", () => {
    locationMock.replace(
      "https://langfuse.com?orderBy=column-Column 3_order-DESC",
    );

    const result = render(
      <QueryParamProvider adapter={NextAdapterPages}>
        <UseOrderByStateExample />
      </QueryParamProvider>,
    );

    expect(result.queryByText(/column Column 3, order DESC/)).toBeTruthy();
  });
});

const UseOrderByStateExample = () => {
  const [orderBy, setOrderBy] = useOrderByState({
    column: "Column 1",
    order: "DESC",
  });

  return (
    <>
      <h1>{`column ${orderBy?.column}, order ${orderBy?.order}`}</h1>
      <button
        onClick={() => {
          setOrderBy({
            column: "Column 2",
            order: "ASC",
          });
        }}
      >
        Set Order
      </button>
    </>
  );
};
