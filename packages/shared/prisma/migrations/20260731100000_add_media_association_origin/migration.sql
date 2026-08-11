-- CreateEnum
CREATE TYPE "MediaAssociationOrigin" AS ENUM (
  'UNKNOWN',
  'CLIENT_UPLOAD',
  'INGESTION_MEDIA_EXTRACTION',
  'INGESTION_FIELD_OVERFLOW'
);

-- AlterTable
-- PostgreSQL 11+ stores this non-volatile default in table metadata, so the
-- large association tables are not rewritten or scanned.
ALTER TABLE "trace_media"
ADD COLUMN "origin" "MediaAssociationOrigin" NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "observation_media"
ADD COLUMN "origin" "MediaAssociationOrigin" NOT NULL DEFAULT 'UNKNOWN';
