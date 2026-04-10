import { getDevSpielwieseRouteProps } from "./[[...slug]]";

describe("getDevSpielwieseRouteProps", () => {
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
});
