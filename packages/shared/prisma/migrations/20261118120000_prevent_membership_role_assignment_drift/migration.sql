-- Membership role assignments are a user's untagged, permanent role assignments.
-- Each membership must hold exactly one, naming the membership's role, and an
-- owner without a membership holds none. This migration repairs rows that broke
-- that rule and then enforces it at commit time.
BEGIN;

-- Drop membership role assignments that disagree with the membership or outlive it.
DELETE FROM "role_assignments" ra
WHERE ra."user_id" IS NOT NULL
  AND cardinality(coalesce(ra."tags", '{}')) = 0
  AND ra."expires_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "organization_memberships" om
    WHERE ra."project_id" IS NULL
      AND om."org_id" = ra."org_id"
      AND om."user_id" = ra."user_id"
      AND ra."role_id" = 'system/' || om."role"::text
  )
  AND NOT EXISTS (
    SELECT 1 FROM "project_memberships" pm
    WHERE pm."project_id" = ra."project_id"
      AND pm."user_id" = ra."user_id"
      AND ra."role_id" = 'system/' || pm."role"::text
  );

-- Assign every organization membership that lacks its role assignment.
INSERT INTO "role_assignments" ("id", "org_id", "owner_id", "principal_id", "user_id", "role_id", "system_role", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       om."org_id",
       'organization/' || om."org_id",
       'user/' || om."user_id",
       om."user_id",
       'system/' || om."role"::text,
       om."role"::text::"SystemRole",
       now(), now()
FROM "organization_memberships" om
WHERE NOT EXISTS (
  SELECT 1 FROM "role_assignments" ra
  WHERE ra."user_id" = om."user_id"
    AND ra."owner_id" = 'organization/' || om."org_id"
    AND cardinality(coalesce(ra."tags", '{}')) = 0
    AND ra."expires_at" IS NULL
)
ON CONFLICT DO NOTHING;

-- Assign every project membership in its project's organization that lacks its role assignment.
INSERT INTO "role_assignments" ("id", "org_id", "owner_id", "project_id", "principal_id", "user_id", "role_id", "system_role", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       p."org_id",
       'project/' || pm."project_id",
       pm."project_id",
       'user/' || pm."user_id",
       pm."user_id",
       'system/' || pm."role"::text,
       pm."role"::text::"SystemRole",
       now(), now()
FROM "project_memberships" pm
JOIN "projects" p ON p."id" = pm."project_id"
JOIN "organization_memberships" om ON om."id" = pm."org_membership_id" AND om."org_id" = p."org_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "role_assignments" ra
  WHERE ra."user_id" = pm."user_id"
    AND ra."owner_id" = 'project/' || pm."project_id"
    AND cardinality(coalesce(ra."tags", '{}')) = 0
    AND ra."expires_at" IS NULL
)
ON CONFLICT DO NOTHING;

-- Raises unless the user's membership role assignments on the owner match the membership.
CREATE FUNCTION "check_membership_role_assignments"(p_user_id TEXT, p_owner_id TEXT) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    membership_role TEXT;
    assigned_roles TEXT[];
BEGIN
    IF p_owner_id LIKE 'organization/%' THEN
        SELECT om."role"::text INTO membership_role
        FROM "organization_memberships" om
        WHERE om."user_id" = p_user_id AND om."org_id" = substr(p_owner_id, length('organization/') + 1);
    ELSIF p_owner_id LIKE 'project/%' THEN
        SELECT pm."role"::text INTO membership_role
        FROM "project_memberships" pm
        WHERE pm."user_id" = p_user_id AND pm."project_id" = substr(p_owner_id, length('project/') + 1);
    END IF;

    SELECT coalesce(array_agg(ra."role_id" ORDER BY ra."role_id"), '{}') INTO assigned_roles
    FROM "role_assignments" ra
    WHERE ra."user_id" = p_user_id
      AND ra."owner_id" = p_owner_id
      AND cardinality(coalesce(ra."tags", '{}')) = 0
      AND ra."expires_at" IS NULL;

    IF (membership_role IS NULL AND cardinality(assigned_roles) = 0)
        OR assigned_roles = ARRAY['system/' || membership_role] THEN
        RETURN;
    END IF;

    RAISE EXCEPTION 'Role assignments % of user % on % do not match membership role %',
        assigned_roles, p_user_id, p_owner_id, coalesce(membership_role, '<none>')
        USING ERRCODE = '23514',
              CONSTRAINT = 'membership_role_assignments_check',
              HINT = 'Write memberships through the membership repository or the admin API, which update role assignments in the same transaction.';
END $$;

CREATE FUNCTION "check_organization_membership_role_assignments"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        PERFORM "check_membership_role_assignments"(OLD."user_id", 'organization/' || OLD."org_id");
    END IF;
    IF TG_OP <> 'DELETE' THEN
        PERFORM "check_membership_role_assignments"(NEW."user_id", 'organization/' || NEW."org_id");
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "organization_memberships_role_assignments_check"
AFTER INSERT OR UPDATE OR DELETE ON "organization_memberships"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_organization_membership_role_assignments"();

CREATE FUNCTION "check_project_membership_role_assignments"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        PERFORM "check_membership_role_assignments"(OLD."user_id", 'project/' || OLD."project_id");
    END IF;
    IF TG_OP <> 'DELETE' THEN
        PERFORM "check_membership_role_assignments"(NEW."user_id", 'project/' || NEW."project_id");
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "project_memberships_role_assignments_check"
AFTER INSERT OR UPDATE OR DELETE ON "project_memberships"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_project_membership_role_assignments"();

CREATE FUNCTION "check_role_assignment_membership"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' AND OLD."user_id" IS NOT NULL THEN
        PERFORM "check_membership_role_assignments"(OLD."user_id", OLD."owner_id");
    END IF;
    IF TG_OP <> 'DELETE' AND NEW."user_id" IS NOT NULL THEN
        PERFORM "check_membership_role_assignments"(NEW."user_id", NEW."owner_id");
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "role_assignments_membership_check"
AFTER INSERT OR UPDATE OR DELETE ON "role_assignments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_role_assignment_membership"();

COMMIT;
