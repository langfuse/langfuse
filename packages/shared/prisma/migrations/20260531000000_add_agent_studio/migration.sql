-- CreateTable
CREATE TABLE "agent_studio_servers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "server_url" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,

    CONSTRAINT "agent_studio_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_studio_chains" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "server_id" TEXT NOT NULL,

    CONSTRAINT "agent_studio_chains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_studio_servers_project_id_idx" ON "agent_studio_servers"("project_id");

-- CreateIndex
CREATE INDEX "agent_studio_chains_server_id_idx" ON "agent_studio_chains"("server_id");

-- AddForeignKey
ALTER TABLE "agent_studio_servers" ADD CONSTRAINT "agent_studio_servers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_studio_chains" ADD CONSTRAINT "agent_studio_chains_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "agent_studio_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
