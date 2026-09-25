-- Backfill one SystemRoleAssignment per existing api_keys row.
-- PROJECT keys map to the PROJECT system role owned by their project;
-- ORGANIZATION keys map to the ORGANIZATION system role owned by their org.
INSERT INTO system_role_assignments (id, org_id, principal_id, system_role, owner_id, created_at, updated_at)
SELECT gen_random_uuid()::text,
       CASE WHEN ak.scope = 'ORGANIZATION' THEN ak.organization_id ELSE p.org_id END,
       'apiKey/' || ak.id,
       ak.scope::text::"SystemRole",
       CASE WHEN ak.scope = 'ORGANIZATION' THEN 'organization/' || ak.organization_id ELSE 'project/' || ak.project_id END,
       now(), now()
FROM api_keys ak
LEFT JOIN projects p ON p.id = ak.project_id
WHERE (ak.scope = 'ORGANIZATION' AND ak.organization_id IS NOT NULL)
   OR (ak.scope = 'PROJECT' AND ak.project_id IS NOT NULL AND p.org_id IS NOT NULL)
ON CONFLICT (principal_id, owner_id, system_role) DO NOTHING;
