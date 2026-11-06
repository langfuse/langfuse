-- CreateEnum
CREATE TYPE "SessionViewMode" AS ENUM ('conversational', 'list');

-- CreateEnum
CREATE TYPE "SessionUnmatchedTraces" AS ENUM ('show', 'hide');

-- CreateEnum
CREATE TYPE "SessionBuiltinView" AS ENUM ('messages');

-- CreateTable
CREATE TABLE "session_views" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "view_mode" "SessionViewMode" NOT NULL,
    "unmatched_traces" "SessionUnmatchedTraces" NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_view_pins" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "view_id" TEXT,
    "builtin_view" "SessionBuiltinView",
    "position" INTEGER NOT NULL,

    CONSTRAINT "session_view_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_views_project_id_name_key" ON "session_views"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "session_views_project_id_id_key" ON "session_views"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "session_view_pins_project_id_user_id_view_id_key" ON "session_view_pins"("project_id", "user_id", "view_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_view_pins_project_id_user_id_builtin_view_key" ON "session_view_pins"("project_id", "user_id", "builtin_view");

-- AddForeignKey
ALTER TABLE "session_views" ADD CONSTRAINT "session_views_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_views" ADD CONSTRAINT "session_views_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_view_pins" ADD CONSTRAINT "session_view_pins_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_view_pins" ADD CONSTRAINT "session_view_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_view_pins" ADD CONSTRAINT "session_view_pins_project_id_view_id_fkey" FOREIGN KEY ("project_id", "view_id") REFERENCES "session_views"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom SQL: Prisma cannot represent the exclusive pin target or access-grant triggers.
ALTER TABLE "session_view_pins" ADD CONSTRAINT "session_view_pins_target_check" CHECK (("view_id" IS NOT NULL) <> ("builtin_view" IS NOT NULL));

-- Match effective project access: project roles override inherited organization roles.
-- Default pins are created on access grants, never on reads, so unpinning needs no marker.
INSERT INTO "session_view_pins" ("id", "project_id", "user_id", "builtin_view", "position")
SELECT gen_random_uuid()::text, p.id, om.user_id, 'messages', -1
FROM projects p
JOIN organization_memberships om ON om.org_id = p.org_id
LEFT JOIN project_memberships pm ON pm.project_id = p.id AND pm.org_membership_id = om.id
WHERE COALESCE(pm.role, om.role) IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')
ON CONFLICT DO NOTHING;

-- Keep initialization at the database boundary: nested writes, SCIM, invitations,
-- admin APIs, and signup all grant access through these same membership tables.
CREATE FUNCTION pin_messages_for_new_project() RETURNS trigger AS $$
BEGIN
    INSERT INTO session_view_pins (id, project_id, user_id, builtin_view, position)
    SELECT gen_random_uuid()::text, NEW.id, om.user_id, 'messages', -1
    FROM organization_memberships om
    WHERE om.org_id = NEW.org_id AND om.role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_view_messages_new_project
AFTER INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION pin_messages_for_new_project();

CREATE FUNCTION pin_messages_for_org_access() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Existing project access must not re-pin a tab the user explicitly hid.
        INSERT INTO session_view_pins (id, project_id, user_id, builtin_view, position)
        SELECT gen_random_uuid()::text, p.id, NEW.user_id, 'messages', -1
        FROM projects p
        LEFT JOIN project_memberships pm ON pm.project_id = p.id AND pm.org_membership_id = NEW.id
        WHERE p.org_id = NEW.org_id
          AND COALESCE(pm.role, NEW.role) IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')
          AND COALESCE(pm.role, OLD.role) NOT IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')
        ON CONFLICT DO NOTHING;
    ELSE
        INSERT INTO session_view_pins (id, project_id, user_id, builtin_view, position)
        SELECT gen_random_uuid()::text, p.id, NEW.user_id, 'messages', -1
        FROM projects p
        LEFT JOIN project_memberships pm ON pm.project_id = p.id AND pm.org_membership_id = NEW.id
        WHERE p.org_id = NEW.org_id
          AND COALESCE(pm.role, NEW.role) IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_view_messages_org_access
AFTER INSERT OR UPDATE OF role ON organization_memberships
FOR EACH ROW EXECUTE FUNCTION pin_messages_for_org_access();

CREATE FUNCTION pin_messages_for_project_access() RETURNS trigger AS $$
DECLARE
    membership project_memberships%ROWTYPE;
    inherited_role "Role";
    previous_role "Role";
    next_role "Role";
BEGIN
    IF TG_OP = 'DELETE' THEN
        membership := OLD;
    ELSE
        membership := NEW;
    END IF;

    SELECT om.role INTO inherited_role
    FROM organization_memberships om
    JOIN projects p ON p.org_id = om.org_id
    WHERE om.id = membership.org_membership_id AND p.id = membership.project_id;
    -- Cascading project/organization deletions do not grant access.
    IF NOT FOUND THEN RETURN NULL; END IF;

    IF TG_OP = 'INSERT' THEN
        previous_role := inherited_role;
        next_role := NEW.role;
    ELSIF TG_OP = 'DELETE' THEN
        previous_role := OLD.role;
        next_role := inherited_role;
    ELSE
        previous_role := OLD.role;
        next_role := NEW.role;
    END IF;

    IF previous_role NOT IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')
       AND next_role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') THEN
        INSERT INTO session_view_pins (id, project_id, user_id, builtin_view, position)
        VALUES (gen_random_uuid()::text, membership.project_id, membership.user_id, 'messages', -1)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_view_messages_project_access
AFTER INSERT OR UPDATE OF role OR DELETE ON project_memberships
FOR EACH ROW EXECUTE FUNCTION pin_messages_for_project_access();
