-- Separate from the column migration: Postgres cannot use a new enum value in the transaction that adds it.
ALTER TYPE "GatewaySpendLimitScope" ADD VALUE IF NOT EXISTS 'USER';
