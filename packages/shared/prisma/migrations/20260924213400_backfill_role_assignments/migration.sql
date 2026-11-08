INSERT INTO "role_assignments" ("id", "org_id", "principal_api_key_id", "system_role", "owner_org_id", "owner_project_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       CASE WHEN ak.scope = 'ORGANIZATION' THEN ak.organization_id ELSE p.org_id END,
       ak.id,
       CASE ak.scope
         WHEN 'PROJECT' THEN 'LEGACY_PROJECT_API_KEY'::"SystemRole"
         WHEN 'ORGANIZATION' THEN 'LEGACY_ORGANIZATION_API_KEY'::"SystemRole"
       END,
       CASE WHEN ak.scope = 'ORGANIZATION' THEN ak.organization_id END,
       CASE WHEN ak.scope = 'PROJECT' THEN ak.project_id END,
       now(), now()
FROM api_keys ak
LEFT JOIN projects p ON p.id = ak.project_id
WHERE (ak.scope = 'ORGANIZATION' AND ak.organization_id IS NOT NULL)
   OR (ak.scope = 'PROJECT' AND ak.project_id IS NOT NULL AND p.org_id IS NOT NULL)
ON CONFLICT DO NOTHING;
