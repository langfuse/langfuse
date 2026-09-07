import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildParityDashboard,
  regions,
  type Region,
  type Widget,
} from "@/src/features/auth/policy/dashboard";

const gateQuery =
  "sum:langfuse.authz.parity{result:new_denies OR result:new_allows} by {seam,action,legacy_code,new_code}";

const queriesOf = (w: Widget): string[] =>
  "requests" in w.definition
    ? w.definition.requests.flatMap((r) => r.queries.map((q) => q.query))
    : [];

describe("buildParityDashboard — the ship-gate dashboard", () => {
  const each = (Object.keys(regions) as Region[]).map((region) => [
    region,
    buildParityDashboard(region),
  ]) as [Region, ReturnType<typeof buildParityDashboard>][];

  it.each(each)(
    "%s dashboard carries the exact human-read gate query",
    (_r, dash) => {
      const allQueries = dash.widgets.flatMap(queriesOf);
      expect(allQueries).toContain(gateQuery);
    },
  );

  it.each(each)("%s titles the region", (region, dash) => {
    expect(dash.title).toContain(regions[region].label);
  });

  it.each(each)(
    "%s makes new_allows and new_denies visually distinct",
    (_r, dash) => {
      const allows = dash.widgets.find(
        (w) =>
          "title" in w.definition &&
          w.definition.title.startsWith("new_allows"),
      );
      const denies = dash.widgets.find(
        (w) =>
          "title" in w.definition &&
          w.definition.title.startsWith("new_denies"),
      );
      expect(allows).toBeDefined();
      expect(denies).toBeDefined();
      expect(queriesOf(allows!)).toContain(
        "sum:langfuse.authz.parity{result:new_allows} by {seam,action,legacy_code,new_code}",
      );
      expect(queriesOf(denies!)).toContain(
        "sum:langfuse.authz.parity{result:new_denies} by {seam,action,legacy_code,new_code}",
      );
      const allowsDef = allows!.definition;
      const deniesDef = denies!.definition;
      const allowsPalette =
        "requests" in allowsDef
          ? allowsDef.requests[0].style?.palette
          : undefined;
      const deniesPalette =
        "requests" in deniesDef
          ? deniesDef.requests[0].style?.palette
          : undefined;
      expect(allowsPalette).toBe("red");
      expect(deniesPalette).toBe("orange");
      expect(allowsPalette).not.toBe(deniesPalette);
    },
  );

  it.each(each)("%s counts coverage per operation", (_r, dash) => {
    const allQueries = dash.widgets.flatMap(queriesOf);
    expect(allQueries).toContain(
      "sum:langfuse.authz.coverage{*} by {operation}",
    );
  });

  it.each(each)("%s states it automates nothing", (_r, dash) => {
    const note = dash.widgets.find((w) => w.definition.type === "note");
    expect(note).toBeDefined();
    expect(
      note!.definition.type === "note" && note!.definition.content,
    ).toMatch(/gates nothing automatically/i);
  });
});

describe("committed dashboard artifacts stay in sync with the builder", () => {
  it.each(Object.keys(regions) as Region[])("parity-%s.json", (region) => {
    const path = join(
      process.cwd(),
      "src/features/auth/policy/dashboards",
      `parity-${region}.json`,
    );
    const committed = readFileSync(path, "utf8");
    expect(committed).toBe(
      JSON.stringify(buildParityDashboard(region), null, 2) + "\n",
    );
  });
});
