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

-- CreateTable
CREATE TABLE "llm_tools" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parameters" JSON NOT NULL,

    CONSTRAINT "llm_tools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_schemas_project_id_name_key" ON "llm_schemas"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "llm_tools_project_id_name_key" ON "llm_tools"("project_id", "name");

-- AddForeignKey
ALTER TABLE "llm_schemas" ADD CONSTRAINT "llm_schemas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_tools" ADD CONSTRAINT "llm_tools_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
