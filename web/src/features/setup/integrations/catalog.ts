import { INTEGRATION_CATEGORIES, INTEGRATIONS } from "./generated";
import type { Integration } from "./types";

const BY_SLUG = new Map(
  INTEGRATIONS.map((integration) => [integration.slug, integration]),
);

/** The catalog's integration with this slug, or `undefined` when the catalog doesn't list it. */
export function integrationOf(slug: string): Integration | undefined {
  return BY_SLUG.get(slug);
}

/** Each category's title by its id. */
export const CATEGORY_TITLES: Record<string, string> = Object.fromEntries(
  INTEGRATION_CATEGORIES.map(({ id, title }) => [id, title]),
);

/** How many integrations each category lists, by its id. */
export const CATEGORY_COUNTS: Record<string, number> = Object.fromEntries(
  INTEGRATION_CATEGORIES.map(({ id }) => [
    id,
    INTEGRATIONS.filter((integration) => integration.category === id).length,
  ]),
);
