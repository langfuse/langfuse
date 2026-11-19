-- Rows of this scope have no subject, so the defaults' partial unique index on
-- (organization_id, scope) already allows one per organization.
ALTER TYPE "GatewaySpendLimitScope" ADD VALUE IF NOT EXISTS 'ORGANIZATION';
