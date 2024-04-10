CREATE TABLE "schemas" (
  "id" TEXT NOT NULL,
  "schema" JSONB NOT NULL,
  "ui_schema" JSONB NOT NULL DEFAULT '{}',
  "project_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schemas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bot_schema_id" TEXT NOT NULL,
    "input_schema_id" TEXT NOT NULL,
    "output_schema_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tasks_bot_schema_id_fkey" FOREIGN KEY ("bot_schema_id") REFERENCES "schemas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tasks_input_schema_id_fkey" FOREIGN KEY ("input_schema_id") REFERENCES "schemas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tasks_output_schema_id_fkey" FOREIGN KEY ("output_schema_id") REFERENCES "schemas"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "bots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "project_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bots_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "bots_project_id_name_version_idx" ON "bots"("project_id", "name", "version");
CREATE UNIQUE INDEX "bots_project_id_name_version_key" ON "bots"("project_id", "name", "version");

CREATE INDEX "tasks_project_id_name_version_idx" ON "tasks"("project_id", "name");
CREATE UNIQUE INDEX "tasks_project_id_name_version_key" ON "tasks"("project_id", "name");

ALTER TABLE "traces" 
  ADD COLUMN "bot_id" TEXT,
  ADD CONSTRAINT "traces_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "datasets" 
  ADD COLUMN "task_id" TEXT,
  ADD CONSTRAINT "datasets_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "observations" ADD COLUMN     "bot_id" TEXT;
ALTER TABLE "observations" ADD CONSTRAINT "observations_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- alter table traces drop column bot_id;
-- alter table datasets drop column task_id;
-- drop table bots
-- drop table tasks
-- drop index bots_project_id_id_version_idx