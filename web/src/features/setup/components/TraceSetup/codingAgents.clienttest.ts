// @vitest-environment node

import { describe, expect, it } from "vitest";
import { integrationOf } from "../../integrations/catalog";
import { CODING_AGENTS } from "./codingAgents";

describe("the coding agents offered by name", () => {
  it("are each a developer tool in the catalog, listed once", () => {
    const slugs = CODING_AGENTS.map(({ slug }) => slug);
    expect(slugs.map((slug) => integrationOf(slug)?.category)).toEqual(
      slugs.map(() => "developer-tools"),
    );
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
