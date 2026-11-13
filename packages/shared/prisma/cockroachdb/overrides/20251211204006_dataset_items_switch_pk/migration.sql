-- CockroachDB has no PRIMARY KEY USING INDEX. The new primary key names its
-- columns, and the unique index it replaces is dropped, matching PostgreSQL,
-- where USING INDEX turns that index into the primary key.

-- AlterTable
ALTER TABLE "dataset_items" DROP CONSTRAINT "dataset_items_pkey",
ADD CONSTRAINT "dataset_items_pkey" PRIMARY KEY ("id", "project_id", "valid_from");

DROP INDEX "dataset_items_id_project_id_valid_from_key";
