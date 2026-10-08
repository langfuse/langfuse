BEGIN;

-- Preserve existing grants, including keys assigned narrower roles.
INSERT INTO "role_assignments" ("id", "org_id", "principal_api_key_id", "system_role", "owner_org_id")
SELECT gen_random_uuid()::text,
       ak.organization_id,
       ak.id,
       'LEGACY_ORGANIZATION_API_KEY'::"SystemRole",
       ak.organization_id
FROM "api_keys" ak
WHERE ak.scope = 'ORGANIZATION'
AND ak.organization_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM "role_assignments" ra
    WHERE ra.principal_api_key_id = ak.id
);

INSERT INTO "role_assignments" ("id", "org_id", "principal_api_key_id", "system_role", "owner_project_id")
SELECT gen_random_uuid()::text,
       p.org_id,
       ak.id,
       'LEGACY_PROJECT_API_KEY'::"SystemRole",
       p.id
FROM "api_keys" ak
JOIN "projects" p ON p.id = ak.project_id
WHERE ak.scope = 'PROJECT'
AND p.org_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM "role_assignments" ra
    WHERE ra.principal_api_key_id = ak.id
)
FOR SHARE OF p;

COMMIT;
