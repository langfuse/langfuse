CREATE TABLE "slack_agent_user_links" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_agent_user_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slack_agent_user_links_team_id_slack_user_id_key" ON "slack_agent_user_links"("team_id", "slack_user_id");
CREATE INDEX "slack_agent_user_links_user_id_idx" ON "slack_agent_user_links"("user_id");
ALTER TABLE "slack_agent_user_links" ADD CONSTRAINT "slack_agent_user_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
