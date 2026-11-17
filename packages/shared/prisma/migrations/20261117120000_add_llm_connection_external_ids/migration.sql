CREATE TABLE "llm_connection_external_ids" (
    "project_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_connection_external_ids_pkey" PRIMARY KEY ("project_id"),
    CONSTRAINT "llm_connection_external_ids_project_id_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
