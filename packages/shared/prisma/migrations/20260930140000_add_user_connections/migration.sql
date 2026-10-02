CREATE TABLE "user_connections" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "user_id" TEXT,
    "link_token_hash" TEXT,
    "link_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_connections_identity_key" ON "user_connections"("project_id", "api_key_id", "provider", "workspace_id", "external_user_id");
CREATE UNIQUE INDEX "user_connections_link_token_hash_key" ON "user_connections"("link_token_hash");
CREATE INDEX "user_connections_api_key_id_idx" ON "user_connections"("api_key_id");
CREATE INDEX "user_connections_user_id_idx" ON "user_connections"("user_id");

ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
