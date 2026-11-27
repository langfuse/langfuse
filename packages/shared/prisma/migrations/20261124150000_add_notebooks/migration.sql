-- CreateEnum
CREATE TYPE "NotebookDocumentWidth" AS ENUM ('contained', 'full');

-- CreateTable
CREATE TABLE "notebooks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "latest_published_version" INTEGER,
    "dirty" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_versions" (
    "notebook_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "published_at" TIMESTAMP(3),
    "layout" JSONB NOT NULL DEFAULT '{"kind":"default"}',

    CONSTRAINT "notebook_versions_pkey" PRIMARY KEY ("notebook_id","number"),
    CONSTRAINT "notebook_versions_publication_check" CHECK (
        ("number" = 0 AND "published_at" IS NULL) OR ("number" > 0 AND "published_at" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "notebook_version_documents" (
    "notebook_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "document_id" TEXT NOT NULL,
    "jsonl" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "width" "NotebookDocumentWidth" NOT NULL DEFAULT 'contained',

    CONSTRAINT "notebook_version_documents_pkey" PRIMARY KEY ("notebook_id","version","document_id")
);

-- CreateTable
CREATE TABLE "notebook_edit_groups" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "run_key" TEXT,
    "before_jsonl" TEXT,
    "after_jsonl" TEXT NOT NULL,
    "before_width" "NotebookDocumentWidth",
    "after_width" "NotebookDocumentWidth" NOT NULL DEFAULT 'contained',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "notebook_edit_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notebooks_project_id_id_idx" ON "notebooks"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notebooks_id_project_id_key" ON "notebooks"("id", "project_id");

-- CreateIndex
CREATE INDEX "notebook_edit_groups_project_id_run_key_closed_at_idx" ON "notebook_edit_groups"("project_id", "run_key", "closed_at");

-- CreateIndex
CREATE INDEX "notebook_edit_groups_notebook_id_document_id_created_at_idx" ON "notebook_edit_groups"("notebook_id", "document_id", "created_at");

-- AddForeignKey
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_versions" ADD CONSTRAINT "notebook_versions_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_version_documents" ADD CONSTRAINT "notebook_version_documents_notebook_id_version_fkey" FOREIGN KEY ("notebook_id", "version") REFERENCES "notebook_versions"("notebook_id", "number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_edit_groups" ADD CONSTRAINT "notebook_edit_groups_notebook_id_project_id_fkey" FOREIGN KEY ("notebook_id", "project_id") REFERENCES "notebooks"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
