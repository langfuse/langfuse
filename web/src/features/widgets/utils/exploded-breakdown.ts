/**
 * Exploded (array) breakdown semantics — shared detection and wording.
 *
 * Array dimensions like tags explode per element in the query engine
 * (arrayJoin): an entity carrying several values is counted once in each
 * matching bucket. Bucket values are honest, but any aggregate ACROSS buckets
 * (pie center total, pivot totals, a stacked bar's height) exceeds the real
 * entity count. Per the charts manifesto ("never silently truncate — or
 * inflate — without saying so"), widgets that break down by an exploded
 * dimension say so with an info notice, pies show a deduplicated total, and
 * pivot totals that cross an exploded dimension are suppressed.
 */
import { startCase } from "lodash";

import {
  viewDeclarations,
  type views,
  type ViewVersion,
} from "@langfuse/shared/query";
import { type z } from "zod";

const ENTITY_NOUN_BY_VIEW: Record<string, string> = {
  traces: "trace",
  observations: "observation",
  "scores-numeric": "score",
  "scores-categorical": "score",
};

/**
 * Returns the subset of `fields` that the query engine explodes per element
 * (declared `explodeArray` in the view's data model), e.g. tags / toolNames.
 */
export function getExplodedDimensionFields(
  view: z.infer<typeof views>,
  version: ViewVersion,
  fields: string[],
): string[] {
  const declaration = viewDeclarations[version]?.[view];
  if (!declaration) return [];
  return fields.filter(
    (field) => declaration.dimensions[field]?.explodeArray === true,
  );
}

/**
 * Human wording for the exploded-breakdown info notice. Undefined when the
 * breakdown has no exploded dimension (no notice to show).
 */
export function buildExplodedBreakdownNotice(
  view: z.infer<typeof views>,
  explodedFields: string[],
): string | undefined {
  if (explodedFields.length === 0) return undefined;
  const noun = ENTITY_NOUN_BY_VIEW[view] ?? "item";
  const article = /^[aeiou]/i.test(noun) ? "An" : "A";
  const label = explodedFields
    .map((field) => startCase(field).toLowerCase())
    .join(" and ");
  return `${article} ${noun} with multiple ${label} is counted once in each matching bucket, so buckets can add up to more than the total number of ${noun}s.`;
}
