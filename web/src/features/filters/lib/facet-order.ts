// Pure facet-ordering helpers for the filter sidebar
// (data-table-controls.tsx). No React, no state — unit-testable.

/**
 * The settled promotion order: which facet columns sit in the sidebar's top
 * block. Held across renders so the list does not reorder under the hands of
 * someone working it (LFE-14843).
 */
export type FacetOrder = {
  /** Columns in the top block, as settled at the last boundary. */
  promoted: ReadonlySet<string>;
  /** The live promoted columns this order was last reconciled against. */
  key: string;
  /** The facet-list interaction this order last attributed a change to. */
  interactionToken: number;
};

export const EMPTY_FACET_ORDER: FacetOrder = {
  promoted: new Set(),
  key: "",
  interactionToken: 0,
};

const orderKey = (promotedColumns: readonly string[]) =>
  promotedColumns.join(",");

/** Settle the order to the live promotion state. */
export function settleFacetOrder(
  promotedColumns: readonly string[],
  interactionToken = 0,
): FacetOrder {
  return {
    promoted: new Set(promotedColumns),
    key: orderKey(promotedColumns),
    interactionToken,
  };
}

/**
 * The order for the current render, given the live promoted columns and the
 * facet list's interaction counter.
 *
 * A promotion change that follows an interaction inside the facet list is the
 * user's own edit: the order stays as settled, so the facet being worked in
 * never moves under the cursor. Every other cause — permalink hydration, a
 * saved view, Clear all, an AI or search-bar apply — re-settles.
 *
 * Attribution consumes the token only when the promoted set actually changes,
 * so an unrelated re-render between the click and the filter landing cannot
 * eat it. Idempotent: same inputs, same output (StrictMode re-renders).
 */
export function advanceFacetOrder(
  order: FacetOrder,
  promotedColumns: readonly string[],
  interactionToken: number,
): FacetOrder {
  const key = orderKey(promotedColumns);
  if (key === order.key) return order;
  // Attribution alone decides: clearing the sole remaining facet in-list must
  // hold its place until the next settle, exactly like any other in-list
  // clear. External empties (a cleared search bar) carry no new interaction
  // and the owned boundaries (Clear all, AI apply) consume outstanding tokens
  // via settleOnNextChange, so both still fall back to plain config order.
  const holdOrder = interactionToken !== order.interactionToken;
  return holdOrder
    ? { promoted: order.promoted, key, interactionToken }
    : settleFacetOrder(promotedColumns, interactionToken);
}

/**
 * Cancel any pending in-list attribution, so the change a boundary action
 * causes settles even if an earlier interaction left one outstanding (an
 * in-list edit that changed values without changing promotion never consumed
 * its token). Called by the boundaries the sidebar owns: Clear all, AI apply.
 */
export function settleOnNextChange(
  order: FacetOrder,
  interactionToken: number,
): FacetOrder {
  return order.interactionToken === interactionToken
    ? order
    : { ...order, interactionToken };
}

/**
 * "Add filter" is a deliberate promotion: the picked facet joins the top block
 * (in config order) without re-settling the facets around it.
 */
export function promoteFacet(order: FacetOrder, column: string): FacetOrder {
  if (order.promoted.has(column)) return order;
  return { ...order, promoted: new Set(order.promoted).add(column) };
}

/** Promoted facets first, config order preserved within each group. */
export function orderFacets<T extends { column: string }>(
  facets: readonly T[],
  order: FacetOrder,
): T[] {
  const promoted: T[] = [];
  const rest: T[] = [];
  for (const facet of facets) {
    (order.promoted.has(facet.column) ? promoted : rest).push(facet);
  }
  return [...promoted, ...rest];
}
