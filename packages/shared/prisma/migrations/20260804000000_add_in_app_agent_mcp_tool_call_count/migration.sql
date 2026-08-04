ALTER TABLE "in_app_agent_conversations"
ADD COLUMN "mcp_tool_call_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "in_app_agent_runs_project_mcp_key_idx"
ON "in_app_agent_runs" ("project_id", "mcp_api_key_id");
