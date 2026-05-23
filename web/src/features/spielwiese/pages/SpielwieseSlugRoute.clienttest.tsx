import { render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import DevSpielwiesePage, {
  getDevSpielwieseRouteProps,
} from "../../../pages/dev/spielwiese/[[...slug]]";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("./SpielwieseRoutePage", () => ({
  __esModule: true,
  default: function MockSpielwieseRoutePage({ slug }: { slug?: string[] }) {
    return <div data-testid="spielwiese-dev-route-slug">{slug?.join("/")}</div>;
  },
}));

const mockedUseRouter = jest.mocked(useRouter);

describe("getDevSpielwieseRouteProps", () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({
      query: {},
    } as ReturnType<typeof useRouter>);
  });

  it("omits slug on the base route so pages props stay serializable", () => {
    expect(getDevSpielwieseRouteProps(undefined)).toEqual({});
  });

  it("normalizes a string slug into an array", () => {
    expect(getDevSpielwieseRouteProps("onboarding")).toEqual({
      slug: ["onboarding"],
    });
  });

  it("passes through array slugs unchanged", () => {
    expect(getDevSpielwieseRouteProps(["onboarding", "draft"])).toEqual({
      slug: ["onboarding", "draft"],
    });
  });

  it("prefers the live router slug over the initial server prop slug", () => {
    mockedUseRouter.mockReturnValue({
      query: {
        slug: ["onboarding", "role"],
      },
    } as ReturnType<typeof useRouter>);

    render(<DevSpielwiesePage slug={["onboarding"]} />);

    expect(screen.getByTestId("spielwiese-dev-route-slug").textContent).toBe(
      "onboarding/role",
    );
  });
});
