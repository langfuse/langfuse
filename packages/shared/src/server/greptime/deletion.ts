import { greptimeQuery } from "./client";
import { TOMBSTONE_EVENT_TYPE } from "./converters";
import { RawEventInput, writeRawEvents } from "./rawEvents";
import {
  GreptimeEntityType,
  metadataTableForEntity,
  projectionTableForEntity,
  quoteIdent,
  tagsTableForEntity,
} from "./schemaUtils";

/**
 * GreptimeDB deletion (02-write-path.md, step 6).
 *
 * IMPORTANT: raw_events is `append_mode=true`, which the engine forbids `DELETE` on. The source of
 * truth is therefore retired by TTL only (invariant 6: raw_events TTL >= projection TTL). Explicit
 * entity deletion (GDPR / project delete) targets the projection + EAV subtables, which are normal
 * merge tables and accept `DELETE`.
 */

const projectionDeletableTables = (
  entityType: GreptimeEntityType,
): string[] => [
  projectionTableForEntity[entityType],
  metadataTableForEntity[entityType],
  tagsTableForEntity[entityType],
];

const tombstoneInput = (
  projectId: string,
  entityType: GreptimeEntityType,
  entityId: string,
  deletedAt: number,
): RawEventInput => ({
  projectId,
  entityType,
  entityId,
  eventId: `tombstone-${entityId}-${deletedAt}`,
  eventType: TOMBSTONE_EVENT_TYPE,
  eventTs: deletedAt,
  ingestedAt: deletedAt,
  body: JSON.stringify({ id: entityId, deletedAt }),
});

const deleteProjectionRows = async (
  projectId: string,
  entityType: GreptimeEntityType,
  entityId: string,
): Promise<void> => {
  for (const table of projectionDeletableTables(entityType)) {
    const idColumn =
      table === projectionTableForEntity[entityType] ? "id" : "entity_id";
    await greptimeQuery({
      query: `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent("project_id")} = ? AND ${quoteIdent(idColumn)} = ?`,
      params: [projectId, entityId],
    });
  }
};

/**
 * Delete a single entity: append a tombstone to raw_events (so a later replay rebuilds it as
 * soft-deleted instead of resurrecting it) and delete its current projection + EAV rows.
 */
export const deleteEntityFromGreptime = async (params: {
  projectId: string;
  entityType: GreptimeEntityType;
  entityId: string;
}): Promise<void> => {
  await writeRawEvents([
    tombstoneInput(
      params.projectId,
      params.entityType,
      params.entityId,
      Date.now(),
    ),
  ]);
  await deleteProjectionRows(
    params.projectId,
    params.entityType,
    params.entityId,
  );
};

/** Delete many entities of one type: batch-tombstone in raw_events, then delete projection + EAV. */
export const deleteEntitiesFromGreptime = async (params: {
  projectId: string;
  entityType: GreptimeEntityType;
  entityIds: string[];
}): Promise<void> => {
  if (params.entityIds.length === 0) return;
  const deletedAt = Date.now();
  await writeRawEvents(
    params.entityIds.map((entityId) =>
      tombstoneInput(params.projectId, params.entityType, entityId, deletedAt),
    ),
  );
  for (const entityId of params.entityIds) {
    await deleteProjectionRows(params.projectId, params.entityType, entityId);
  }
};

/**
 * Delete every projection + EAV row for a project. raw_events is left to TTL and NOT tombstoned
 * per-entity (the entity id list isn't enumerated here), so a bulk reprocess-all during the TTL
 * window could resurrect a deleted project's projections. Acceptable because a deleted project is
 * removed from Postgres and not normally reprocessed; a project-level deleted-set guard is a
 * follow-up if reprocess-all over deleted projects becomes a real workflow.
 */
export const deleteProjectFromGreptime = async (
  projectId: string,
): Promise<void> => {
  const entityTypes: GreptimeEntityType[] = ["trace", "observation", "score"];
  for (const entityType of entityTypes) {
    for (const table of projectionDeletableTables(entityType)) {
      await greptimeQuery({
        query: `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent("project_id")} = ?`,
        params: [projectId],
      });
    }
  }
};
