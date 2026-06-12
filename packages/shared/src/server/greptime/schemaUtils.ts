/**
 * GreptimeDB identifier + table-name helpers (02-write-path.md).
 *
 * Quoting is only needed on the SQL surfaces (the MySQL-wire read path and DELETEs); the gRPC
 * ingester matches columns by name and needs no quoting. GreptimeDB has a large reserved-word
 * set, and our projection columns collide with many of them (timestamp, id, name, value, key,
 * type, level, source, comment, version, public, input, output, metadata, tags, ...), so the
 * safe rule is to quote every identifier we emit into SQL.
 */

export type GreptimeEntityType = "trace" | "observation" | "score";

/** Projection table name for an ingestion entity type. */
export const projectionTableForEntity: Record<GreptimeEntityType, string> = {
  trace: "traces",
  observation: "observations",
  score: "scores",
};

/** EAV metadata subtable name for an entity type. */
export const metadataTableForEntity: Record<GreptimeEntityType, string> = {
  trace: "traces_metadata",
  observation: "observations_metadata",
  score: "scores_metadata",
};

/** EAV tags subtable name for an entity type (only traces carry tags today). */
export const tagsTableForEntity: Record<GreptimeEntityType, string> = {
  trace: "traces_tags",
  observation: "observations_tags",
  score: "scores_tags",
};

/**
 * Backtick-quote a single identifier for GreptimeDB SQL (MySQL dialect). Escapes embedded
 * backticks. Use for every column/table name emitted into a SQL string.
 */
export const quoteIdent = (ident: string): string =>
  "`" + ident.replace(/`/g, "``") + "`";
