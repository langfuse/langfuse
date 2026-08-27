import { getIdNavigationItem, getSearchAnalytics } from "./CommandMenu";

describe("getIdNavigationItem", () => {
  it("filters traces by an exact 32-character hex ID", () => {
    expect(
      getIdNavigationItem("0123456789abcdef0123456789ABCDEF", "project-1"),
    ).toEqual({
      type: "trace_id",
      title: "Find trace by ID",
      url: "/project/project-1/traces?filter=id%3Bstring%3B%3B%3D%3B0123456789abcdef0123456789ABCDEF",
    });
  });

  it("filters the traces table by an exact 16-character observation ID", () => {
    expect(getIdNavigationItem("0123456789aBCDef", "project-1")).toEqual({
      type: "observation_id",
      title: "Find observation by ID",
      url: "/project/project-1/traces?filter=id%3Bstring%3B%3Bcontains%3B0123456789aBCDef",
    });
  });

  it.each([
    ["", "project-1"],
    ["0123456789abcde", "project-1"],
    ["0123456789abcdefg", "project-1"],
    ["not-a-hex-id-123", "project-1"],
    ["0123456789abcdef", undefined],
  ])("does not match %j in project %j", (search, projectId) => {
    expect(getIdNavigationItem(search, projectId)).toBeNull();
  });

  it("classifies searches without retaining their raw value", () => {
    const search = "0123456789abcdef";

    expect(getSearchAnalytics(search)).toEqual({
      queryLength: 16,
      queryType: "observation_id",
    });
    expect(getSearchAnalytics(search)).not.toHaveProperty("search");
  });
});
