/** Where a link into the plan dialog came from; "link" covers anything unknown. */
const PLAN_DIALOG_LINK_SOURCES = ["sidebar", "coupon", "link"] as const;
export type PlanDialogLinkSource = (typeof PLAN_DIALOG_LINK_SOURCES)[number];

const PLANS_PARAM = "plans";
const SOURCE_PARAM = "source";

/** The query string that opens the plan dialog on the billing page. */
export const planDialogSearch = (source: PlanDialogLinkSource) =>
  `?${PLANS_PARAM}=open&${SOURCE_PARAM}=${source}`;

/** The billing page of an organization with its plan dialog open. */
export const planDialogHref = (orgId: string, source: PlanDialogLinkSource) =>
  `/organization/${orgId}/settings/billing${planDialogSearch(source)}`;

type Query = Record<string, string | string[] | undefined>;

/** The source of a link that asks for the plan dialog, or null when the query asks for nothing. */
export function planDialogSourceFromQuery(
  query: Query,
): PlanDialogLinkSource | null {
  if (query[PLANS_PARAM] !== "open") return null;
  const source = query[SOURCE_PARAM];
  return PLAN_DIALOG_LINK_SOURCES.find((known) => known === source) ?? "link";
}

/** The query without the plan dialog's parameters. */
export function withoutPlanDialogParams(query: Query): Query {
  const { [PLANS_PARAM]: _plans, [SOURCE_PARAM]: _source, ...rest } = query;
  return rest;
}
