import { describe, expect, it } from "vitest";

import { getViewDeclaration } from "../dataModel";
import { SCORES_LISTABLE_COUNT_VIEW, views, viewVersions } from "../types";
import { astViewsByDeclaration } from "./astViewQuery";
import { eventsTracesAstView } from "./eventsTracesQuery";
import { AST_VIEWS } from "./queryBuilder";

describe("AST view dispatch", () => {
  // Fails when a view moves onto or off the query AST, and when the
  // declaration `getViewDeclaration` returns is not the object an AST view
  // serves (a copy falls back to SQL text).
  it("leaves exactly these declarations on the SQL-text path", () => {
    const onSqlText = viewVersions.options.flatMap((version) =>
      [...views.options, SCORES_LISTABLE_COUNT_VIEW]
        .filter((name) => !AST_VIEWS.has(getViewDeclaration(name, version)))
        .map((name) => `${version}:${name}`),
    );
    expect(onSqlText).toEqual([
      "v1:traces",
      "v1:observations",
      "v1:scores-numeric",
      "v1:scores-categorical",
      "v1:scores-boolean",
      "v1:scores-listable-count",
    ]);
  });

  it("throws for a declaration that two AST views serve", () => {
    expect(() =>
      astViewsByDeclaration([eventsTracesAstView, eventsTracesAstView]),
    ).toThrow('View "events_traces" is served by two AST views.');
  });
});
