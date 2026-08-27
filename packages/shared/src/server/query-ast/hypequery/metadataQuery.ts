import { table } from "./db";
import {
  metadataFilter,
  metadataSelect,
  type MetadataFilterNode,
  type MetadataSelectNode,
} from "./metadata";
import { selectPlan, type SelectPlan } from "./plan";

export function buildMetadataAccessPlan(input: {
  key: string;
  select?: boolean;
  whereGt?: number;
  havingGt?: number;
}): SelectPlan {
  const extras: {
    tableAlias: string;
    metadataSelect?: MetadataSelectNode;
    metadataWhere?: MetadataFilterNode;
    metadataHaving?: MetadataFilterNode;
  } = { tableAlias: "e" };

  if (input.select !== false) {
    extras.metadataSelect = metadataSelect(input.key);
  }
  if (input.whereGt !== undefined) {
    extras.metadataWhere = metadataFilter(input.key, "gt", input.whereGt);
  }
  if (input.havingGt !== undefined) {
    extras.metadataHaving = metadataFilter(input.key, "gt", input.havingGt);
    return selectPlan(
      table("events_core").select(["span_id"]).groupBy("span_id"),
      extras,
    );
  }

  return selectPlan(table("events_core").select(["span_id"]), extras);
}
