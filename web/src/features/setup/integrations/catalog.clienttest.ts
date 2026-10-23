// @vitest-environment node

import { describe, expect, it } from "vitest";
import { integrationOf } from "./catalog";
import { INTEGRATION_CATEGORIES, INTEGRATIONS } from "./generated";
import { LOGOS } from "./logos";
import { FEATURED_SLUGS, POPULAR_SLUGS } from "./search";

const duplicatesIn = (values: string[]) =>
  values.filter((value, index) => values.indexOf(value) !== index);

describe("the integrations catalog", () => {
  it("lists every slug once and every category it uses", () => {
    expect(duplicatesIn(INTEGRATIONS.map(({ slug }) => slug))).toEqual([]);
    const categories = INTEGRATION_CATEGORIES.map(({ id }) => id);
    expect(duplicatesIn(categories)).toEqual([]);
    expect(
      INTEGRATIONS.filter(({ category }) => !categories.includes(category)),
    ).toEqual([]);
  });

  it.each([
    ["FEATURED_SLUGS", FEATURED_SLUGS],
    ["POPULAR_SLUGS", POPULAR_SLUGS],
    ["LOGOS", Object.keys(LOGOS)],
  ])("resolves every slug in %s, once", (_, slugs) => {
    expect(slugs.filter((slug) => integrationOf(slug) === undefined)).toEqual(
      [],
    );
    expect(duplicatesIn(slugs)).toEqual([]);
  });
});
