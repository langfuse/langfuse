INSERT INTO "role_assignments" ("id", "org_id", "owner_id", "principal_id", "user_id", "role_id", "system_role", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       om.org_id,
       'organization/' || om.org_id,
       'user/' || om.user_id,
       om.user_id,
       'system/' || om.role::text,
       om.role::text::"SystemRole",
       now(), now()
FROM organization_memberships om
ON CONFLICT DO NOTHING;

INSERT INTO "role_assignments" ("id", "org_id", "owner_id", "project_id", "principal_id", "user_id", "role_id", "system_role", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       p.org_id,
       'project/' || pm.project_id,
       pm.project_id,
       'user/' || pm.user_id,
       pm.user_id,
       'system/' || pm.role::text,
       pm.role::text::"SystemRole",
       now(), now()
FROM project_memberships pm
JOIN projects p ON p.id = pm.project_id
JOIN organization_memberships om ON om.id = pm.org_membership_id AND om.org_id = p.org_id
ON CONFLICT DO NOTHING;
