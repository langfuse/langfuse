import {
  advanceFacetOrder,
  EMPTY_FACET_ORDER,
  orderFacets,
  promoteFacet,
  settleFacetOrder,
  settleOnNextChange,
  type FacetOrder,
} from "./facet-order";

const CATALOG = [{ column: "alpha" }, { column: "beta" }, { column: "gamma" }];
const shown = (order: FacetOrder) =>
  orderFacets(CATALOG, order).map((facet) => facet.column);

describe("facet order", () => {
  it("settles promoted-first, config order within each group", () => {
    expect(shown(settleFacetOrder(["beta"]))).toEqual([
      "beta",
      "alpha",
      "gamma",
    ]);
    expect(shown(settleFacetOrder(["gamma", "beta"]))).toEqual([
      "beta",
      "gamma",
      "alpha",
    ]);
    // no promotion at all: the config order stands
    expect(shown(EMPTY_FACET_ORDER)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("holds the order through the user's own edits and re-settles on the next external change", () => {
    // Boundary (mount / permalink hydration): beta arrives active and promoted.
    let order = advanceFacetOrder(EMPTY_FACET_ORDER, ["beta"], 0);
    expect(shown(order)).toEqual(["beta", "alpha", "gamma"]);

    // The user clicks a value on gamma, low in the list: it activates in place.
    order = advanceFacetOrder(order, ["beta", "gamma"], 1);
    expect(shown(order)).toEqual(["beta", "alpha", "gamma"]);

    // A StrictMode re-render with the same inputs must not move anything.
    expect(advanceFacetOrder(order, ["beta", "gamma"], 1)).toBe(order);

    // Clearing beta mid-session leaves the layout alone too.
    order = advanceFacetOrder(order, ["gamma"], 2);
    expect(shown(order)).toEqual(["beta", "alpha", "gamma"]);

    // An apply from elsewhere (search bar, saved view, Clear all, AI) carries
    // no new facet interaction, so the order settles to reality.
    order = advanceFacetOrder(order, ["alpha", "gamma"], 2);
    expect(shown(order)).toEqual(["alpha", "gamma", "beta"]);
  });

  it("holds the block when the user clears the sole remaining facet in-list", () => {
    // beta is the only promoted facet; the user clears it inside the list.
    const order = settleFacetOrder(["beta"]);

    // Attributed to an in-list interaction: beta keeps its place until the
    // next settle instead of vanishing behind the fold mid-gesture.
    expect(shown(advanceFacetOrder(order, [], 1))).toEqual([
      "beta",
      "alpha",
      "gamma",
    ]);

    // An external empty (cleared search bar) carries no new interaction and
    // falls back to plain config order.
    expect(shown(advanceFacetOrder(order, [], 0))).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("a boundary the sidebar owns drops outstanding attribution before the next change", () => {
    // beta settled on top, then in-list edits that changed values but not
    // promotion: none of them consumed the token, so one is still outstanding.
    const order = settleFacetOrder(["beta"]);
    const token = 3;

    // Left outstanding, the attribution would hold the old block…
    expect(shown(advanceFacetOrder(order, ["gamma"], token))).toEqual([
      "beta",
      "alpha",
      "gamma",
    ]);
    // …so a boundary the sidebar owns (Clear all, AI apply) drops it first.
    expect(
      shown(
        advanceFacetOrder(settleOnNextChange(order, token), ["gamma"], token),
      ),
    ).toEqual(["gamma", "alpha", "beta"]);
  });

  it("promotes an added facet into the top block without re-settling the rest", () => {
    // alpha activated in place during the session, so it stays below the line.
    let order = advanceFacetOrder(
      settleFacetOrder(["beta"]),
      ["alpha", "beta"],
      1,
    );
    expect(shown(order)).toEqual(["beta", "alpha", "gamma"]);

    // "Add filter" → gamma: a deliberate promotion of gamma only.
    order = advanceFacetOrder(
      promoteFacet(order, "gamma"),
      ["alpha", "beta", "gamma"],
      2,
    );
    expect(shown(order)).toEqual(["beta", "gamma", "alpha"]);
  });
});
