UPDATE audit_logs
SET org_id = projects.org_id
FROM projects
WHERE audit_logs.org_id IS NULL AND audit_logs.project_id = projects.id;

ALTER TABLE "audit_logs" ALTER COLUMN "org_id" SET NOT NULL;