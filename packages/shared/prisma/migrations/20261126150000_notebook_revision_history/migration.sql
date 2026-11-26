BEGIN;

ALTER TABLE "notebooks" ADD COLUMN "draft_revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "notebook_versions"
    DROP CONSTRAINT "notebook_versions_publication_check",
    ADD COLUMN "author_id" TEXT,
    ADD COLUMN "edited_at" TIMESTAMP(3);

-- Keep published numbers stable; move the old draft after the published history.
UPDATE "notebooks" SET "draft_revision" = COALESCE("latest_published_version", 0) + 1;
UPDATE "notebook_versions" AS revision
SET "number" = notebook."draft_revision"
FROM "notebooks" AS notebook
WHERE revision."notebook_id" = notebook."id" AND revision."number" = 0;

CREATE TABLE "notebook_publications" (
    "notebook_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("notebook_id", "number"),
    FOREIGN KEY ("notebook_id", "revision") REFERENCES "notebook_versions"("notebook_id", "number") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "notebook_publications_notebook_id_revision_idx" ON "notebook_publications"("notebook_id", "revision");
INSERT INTO "notebook_publications" ("notebook_id", "number", "revision", "published_at")
SELECT "notebook_id", "number", "number", "published_at"
FROM "notebook_versions" WHERE "published_at" IS NOT NULL;
ALTER TABLE "notebook_versions" DROP COLUMN "published_at";

CREATE TABLE "notebook_document_bodies" (
    "notebook_id" TEXT NOT NULL REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "hash" TEXT NOT NULL,
    "jsonl" TEXT NOT NULL,
    PRIMARY KEY ("notebook_id", "hash")
);
INSERT INTO "notebook_document_bodies" ("notebook_id", "hash", "jsonl")
SELECT DISTINCT ON ("notebook_id", "content_hash") "notebook_id", "content_hash", "jsonl" FROM "notebook_version_documents";
ALTER TABLE "notebook_version_documents"
    ADD FOREIGN KEY ("notebook_id", "content_hash") REFERENCES "notebook_document_bodies"("notebook_id", "hash") ON DELETE NO ACTION ON UPDATE CASCADE,
    DROP COLUMN "jsonl";
CREATE INDEX "notebook_version_documents_notebook_id_content_hash_idx" ON "notebook_version_documents"("notebook_id", "content_hash");

DROP TABLE "notebook_edit_groups";

COMMIT;
