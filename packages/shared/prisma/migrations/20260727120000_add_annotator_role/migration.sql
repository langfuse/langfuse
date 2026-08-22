-- AlterType
-- This migration adds the ANNOTATOR value to the Role enum.
-- ANNOTATOR is a project-level role for annotation queue workers:
-- read-only everywhere except annotation queues (assignments, scores, comments).
-- It has no org-level scopes (same as VIEWER) and sits at the same hierarchy
-- level as VIEWER in orderedRoles, so only ADMIN+ can assign it.

-- PostgreSQL does not support ALTER TYPE ... ADD VALUE inside a transaction
-- in versions < 12. Since Prisma migrations run in a transaction by default,
-- we use IF NOT EXISTS for idempotency. The value is added after NONE in the
-- enum sort order, but enum value ordering only matters for ORDER BY using
-- the enum type directly, which Langfuse does not do for Role.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ANNOTATOR';
