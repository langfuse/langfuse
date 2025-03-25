-- CreateTable
CREATE TABLE "llm_schemas" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "schema" JSON NOT NULL,

    CONSTRAINT "llm_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_schemas_project_id_idx" ON "llm_schemas"("project_id");

-- AddForeignKey
ALTER TABLE "llm_schemas" ADD CONSTRAINT "llm_schemas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddUniqueConstraint
ALTER TABLE "llm_schemas" ADD CONSTRAINT "llm_schemas_project_id_name_key" UNIQUE ("project_id", "name");
