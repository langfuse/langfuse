-- Drop media parent-row foreign keys from high-write media link tables.
-- Link rows are now cleaned up explicitly by media deletion code to avoid
-- parent-row MultiXact contention during concurrent media upload URL requests.
ALTER TABLE "trace_media" DROP CONSTRAINT IF EXISTS "trace_media_media_id_project_id_fkey";
ALTER TABLE "observation_media" DROP CONSTRAINT IF EXISTS "observation_media_media_id_project_id_fkey";
