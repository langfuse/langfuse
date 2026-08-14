-- CreateTable
CREATE TABLE "v4_migration_project_states" (
    "project_id" TEXT NOT NULL,
    "readiness" TEXT NOT NULL,
    "sdk_status" TEXT NOT NULL,
    "has_v4_traffic" BOOLEAN NOT NULL,
    "first_action_needed_at" TIMESTAMP(3),
    "migration_started_at" TIMESTAMP(3),
    "migrated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v4_migration_project_states_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "v4_migration_project_states" ADD CONSTRAINT "v4_migration_project_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
