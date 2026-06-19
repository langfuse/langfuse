CREATE TABLE "observation_io_parser_configs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "filters" JSONB NOT NULL,
    "instructions" JSONB NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "observation_io_parser_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "observation_io_parser_preferences" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "selected_config_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "observation_io_parser_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "observation_io_parser_configs_project_id_name_key" ON "observation_io_parser_configs"("project_id", "name");
CREATE UNIQUE INDEX "observation_io_parser_preferences_project_user_key" ON "observation_io_parser_preferences"("project_id", "user_id") WHERE "user_id" IS NOT NULL;
CREATE UNIQUE INDEX "observation_io_parser_preferences_project_key" ON "observation_io_parser_preferences"("project_id") WHERE "user_id" IS NULL;

ALTER TABLE "observation_io_parser_configs" ADD CONSTRAINT "observation_io_parser_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "observation_io_parser_configs" ADD CONSTRAINT "observation_io_parser_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "observation_io_parser_configs" ADD CONSTRAINT "observation_io_parser_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "observation_io_parser_preferences" ADD CONSTRAINT "observation_io_parser_preferences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "observation_io_parser_preferences" ADD CONSTRAINT "observation_io_parser_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "observation_io_parser_preferences" ADD CONSTRAINT "observation_io_parser_preferences_selected_config_id_fkey" FOREIGN KEY ("selected_config_id") REFERENCES "observation_io_parser_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "observation_io_parser_preferences" ADD CONSTRAINT "observation_io_parser_preferences_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
